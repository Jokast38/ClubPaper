"""Stripe catalog setup - runs at startup, idempotent."""
import os
import stripe

def setup_catalog():
    api_key = os.environ.get("STRIPE_SECRET_KEY")
    if not api_key:
        return
    stripe.api_key = api_key

    catalog = [
        {
            "emergent_product_id": "clubmanager_starter",
            "name": "ClubManager - Abonnement Club",
            "tax_code": "txcd_10103001",
            "prices": [
                {"lookup_key": "clubmanager_monthly", "amount": 1900, "currency": "eur", "interval": "month"},
            ],
        },
    ]

    for entry in catalog:
        product = None
        for p in stripe.Product.list(active=True, limit=100).auto_paging_iter():
            if p.to_dict().get("metadata", {}).get("emergent_product_id") == entry["emergent_product_id"]:
                product = p
                break
        if not product:
            product = stripe.Product.create(
                name=entry["name"],
                tax_code=entry.get("tax_code"),
                metadata={"managed_by": "emergent", "emergent_product_id": entry["emergent_product_id"]},
            )

        for pr in entry["prices"]:
            existing = stripe.Price.list(lookup_keys=[pr["lookup_key"]], active=True, limit=1).data
            if existing and (existing[0].unit_amount != pr["amount"] or existing[0].currency != pr["currency"]):
                stripe.Price.modify(existing[0].id, active=False)
                existing = []
            if not existing:
                kwargs = dict(
                    product=product.id,
                    unit_amount=pr["amount"],
                    currency=pr["currency"],
                    lookup_key=pr["lookup_key"],
                    transfer_lookup_key=True,
                )
                if pr.get("interval"):
                    kwargs["recurring"] = {"interval": pr["interval"]}
                stripe.Price.create(**kwargs)

if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    setup_catalog()
    print("Catalog ready.")
