"""PDF generation with club branding (logo + colors)."""
import io
import base64
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image, Table, TableStyle
from reportlab.lib.units import cm


def _hex_to_color(hex_str: str, default="#EA580C"):
    try:
        h = (hex_str or default).lstrip("#")
        return colors.HexColor("#" + h)
    except Exception:
        return colors.HexColor(default)


def _logo_from_data_url(data_url: str):
    if not data_url or "," not in data_url:
        return None
    try:
        _, b64 = data_url.split(",", 1)
        return io.BytesIO(base64.b64decode(b64))
    except Exception:
        return None


def _base_styles(primary_hex: str):
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="ClubTitle", parent=styles["Title"], fontSize=22, textColor=_hex_to_color(primary_hex), alignment=0, spaceAfter=6))
    styles.add(ParagraphStyle(name="ClubSubtitle", parent=styles["Normal"], fontSize=10, textColor=colors.HexColor("#64748B"), spaceAfter=14))
    styles.add(ParagraphStyle(name="SectionH", parent=styles["Heading3"], textColor=_hex_to_color(primary_hex), spaceBefore=16, spaceAfter=6))
    styles.add(ParagraphStyle(name="Body", parent=styles["Normal"], fontSize=11, leading=16))
    styles.add(ParagraphStyle(name="Small", parent=styles["Normal"], fontSize=9, textColor=colors.HexColor("#64748B")))
    return styles


def _header(club: dict, subtitle: str, styles):
    logo_buf = _logo_from_data_url(club.get("logo_data_url", ""))
    header = []
    title = f"<b>{club.get('name', 'Club')}</b>"
    if logo_buf:
        try:
            img = Image(logo_buf, width=2.5*cm, height=2.5*cm, kind="proportional")
            tbl = Table([[img, Paragraph(f"{title}<br/><font size=10 color='#64748B'>{club.get('sport','')} · {club.get('city','')}</font>", styles["Normal"])]], colWidths=[3*cm, 12*cm])
            tbl.setStyle(TableStyle([("VALIGN", (0,0), (-1,-1), "MIDDLE"), ("LEFTPADDING", (0,0), (-1,-1), 0)]))
            header.append(tbl)
        except Exception:
            header.append(Paragraph(title, styles["ClubTitle"]))
    else:
        header.append(Paragraph(title, styles["ClubTitle"]))
    header.append(Spacer(1, 6))
    header.append(Paragraph(subtitle, styles["ClubSubtitle"]))
    return header


def _append_signature(elems, club: dict, styles):
    """Append the club's signature image (if configured) plus a 'Le bureau' caption."""
    sig_buf = _logo_from_data_url(club.get("signature_data_url", ""))
    if sig_buf:
        try:
            img = Image(sig_buf, width=4.5*cm, height=2.2*cm)
            img.hAlign = "LEFT"
            elems.append(img)
        except Exception:
            pass
    elems.append(Paragraph(f"Pour {club.get('name','')} — Le bureau", styles["Small"]))


def build_pdf(elements) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=2*cm, rightMargin=2*cm, topMargin=2*cm, bottomMargin=2*cm)
    doc.build(elements)
    buf.seek(0)
    return buf.read()


def receipt_pdf(club: dict, member: dict, fee: dict) -> bytes:
    styles = _base_styles(club.get("theme", {}).get("primary", "#EA580C"))
    elems = _header(club, f"Reçu de paiement — Cotisation saison {fee.get('season','')}", styles)
    paid_date = fee.get("paid_at") or datetime.now().isoformat()
    try:
        paid_str = datetime.fromisoformat(paid_date.replace("Z","")).strftime("%d/%m/%Y")
    except Exception:
        paid_str = paid_date
    elems.append(Paragraph(f"<b>Numéro de reçu</b> : {fee.get('id','')[:8].upper()}", styles["Body"]))
    elems.append(Paragraph(f"<b>Date de paiement</b> : {paid_str}", styles["Body"]))
    elems.append(Spacer(1, 10))

    data = [
        ["Adhérent", f"{member.get('first_name','')} {member.get('last_name','')}"],
        ["Équipe", member.get("team") or "—"],
        ["Saison", fee.get("season","")],
        ["Montant réglé", f"{fee.get('amount',0):.2f} €"],
        ["Statut", "Payé"],
    ]
    tbl = Table(data, colWidths=[5*cm, 11*cm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (0,-1), colors.HexColor("#F1F5F9")),
        ("TEXTCOLOR", (0,0), (0,-1), colors.HexColor("#0F172A")),
        ("FONTNAME", (0,0), (0,-1), "Helvetica-Bold"),
        ("BOX", (0,0), (-1,-1), 0.5, colors.HexColor("#CBD5E1")),
        ("INNERGRID", (0,0), (-1,-1), 0.25, colors.HexColor("#E2E8F0")),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("LEFTPADDING", (0,0), (-1,-1), 10),
        ("TOPPADDING", (0,0), (-1,-1), 8),
        ("BOTTOMPADDING", (0,0), (-1,-1), 8),
    ]))
    elems.append(tbl)
    elems.append(Spacer(1, 20))
    elems.append(Paragraph("Ce reçu tient lieu de justificatif de paiement pour la saison indiquée.", styles["Small"]))
    elems.append(Spacer(1, 16))
    _append_signature(elems, club, styles)
    elems.append(Spacer(1, 10))
    elems.append(Paragraph(f"{club.get('name','')}<br/>{club.get('address','')}<br/>{club.get('email','')} · {club.get('phone','')}", styles["Small"]))
    return build_pdf(elems)


def member_sheet_pdf(club: dict, member: dict, fees: list) -> bytes:
    styles = _base_styles(club.get("theme", {}).get("primary", "#EA580C"))
    elems = _header(club, "Fiche adhérent", styles)
    elems.append(Paragraph(f"<b>{member.get('first_name','')} {member.get('last_name','')}</b>", styles["SectionH"]))

    info = [
        ["Email", member.get("email") or "—"],
        ["Téléphone", member.get("phone") or "—"],
        ["Date de naissance", member.get("birth_date") or "—"],
        ["Équipe", member.get("team") or "—"],
        ["Statut licence", {"valid":"En règle","pending":"En attente","expired":"Expirée"}.get(member.get("license_status"), "—")],
        ["Certificat médical", {"ok":"Reçu","missing":"Manquant","expired":"Expiré"}.get(member.get("medical_cert_status"), "—")],
        ["Parent (si mineur)", f"{member.get('parent_name','') or '—'} · {member.get('parent_email','')}"],
    ]
    tbl = Table(info, colWidths=[5*cm, 11*cm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (0,-1), colors.HexColor("#F8FAFC")),
        ("FONTNAME", (0,0), (0,-1), "Helvetica-Bold"),
        ("BOX", (0,0), (-1,-1), 0.5, colors.HexColor("#CBD5E1")),
        ("INNERGRID", (0,0), (-1,-1), 0.25, colors.HexColor("#E2E8F0")),
        ("LEFTPADDING", (0,0), (-1,-1), 10), ("TOPPADDING", (0,0), (-1,-1), 6), ("BOTTOMPADDING", (0,0), (-1,-1), 6),
    ]))
    elems.append(tbl)

    if fees:
        elems.append(Paragraph("Historique des cotisations", styles["SectionH"]))
        rows = [["Saison", "Montant", "Statut", "Échéance"]]
        for f in fees:
            rows.append([f.get("season",""), f"{f.get('amount',0):.2f} €", {"paid":"Payé","pending":"En attente","overdue":"En retard"}.get(f.get("status"),"—"), f.get("due_date","—")])
        t2 = Table(rows, colWidths=[4*cm, 3*cm, 4*cm, 4*cm])
        t2.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,0), _hex_to_color(club.get("theme",{}).get("primary","#EA580C"))),
            ("TEXTCOLOR", (0,0), (-1,0), colors.white),
            ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
            ("BOX", (0,0), (-1,-1), 0.5, colors.HexColor("#CBD5E1")),
            ("INNERGRID", (0,0), (-1,-1), 0.25, colors.HexColor("#E2E8F0")),
            ("LEFTPADDING", (0,0), (-1,-1), 8), ("TOPPADDING", (0,0), (-1,-1), 6), ("BOTTOMPADDING", (0,0), (-1,-1), 6),
        ]))
        elems.append(t2)

    if member.get("notes"):
        elems.append(Paragraph("Notes", styles["SectionH"]))
        elems.append(Paragraph(member["notes"], styles["Body"]))

    elems.append(Spacer(1, 20))
    _append_signature(elems, club, styles)
    elems.append(Spacer(1, 10))
    elems.append(Paragraph(f"Édité le {datetime.now().strftime('%d/%m/%Y')} · {club.get('name','')}", styles["Small"]))
    return build_pdf(elems)


def license_pdf(club: dict, member: dict) -> bytes:
    styles = _base_styles(club.get("theme", {}).get("primary", "#EA580C"))
    elems = _header(club, "Attestation de licence sportive", styles)
    elems.append(Spacer(1, 6))
    elems.append(Paragraph(
        f"Le bureau de <b>{club.get('name','')}</b> atteste que "
        f"<b>{member.get('first_name','')} {member.get('last_name','')}</b> est licencié(e) au club pour la saison en cours.",
        styles["Body"]))
    elems.append(Spacer(1, 12))
    data = [
        ["Nom", f"{member.get('first_name','')} {member.get('last_name','')}"],
        ["Discipline", club.get("sport","")],
        ["Équipe", member.get("team") or "—"],
        ["Statut licence", {"valid":"En règle","pending":"En attente","expired":"Expirée"}.get(member.get("license_status"), "—")],
    ]
    tbl = Table(data, colWidths=[5*cm, 11*cm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (0,-1), colors.HexColor("#F1F5F9")),
        ("FONTNAME", (0,0), (0,-1), "Helvetica-Bold"),
        ("BOX", (0,0), (-1,-1), 0.5, colors.HexColor("#CBD5E1")),
        ("INNERGRID", (0,0), (-1,-1), 0.25, colors.HexColor("#E2E8F0")),
        ("LEFTPADDING", (0,0), (-1,-1), 10), ("TOPPADDING", (0,0), (-1,-1), 8), ("BOTTOMPADDING", (0,0), (-1,-1), 8),
    ]))
    elems.append(tbl)
    elems.append(Spacer(1, 30))
    elems.append(Paragraph(f"Fait à {club.get('city','')} le {datetime.now().strftime('%d/%m/%Y')}.", styles["Body"]))
    elems.append(Spacer(1, 16))
    _append_signature(elems, club, styles)
    return build_pdf(elems)
