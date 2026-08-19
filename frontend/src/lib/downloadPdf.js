import { api } from "@/lib/api";
import { toast } from "sonner";

export async function downloadPdf(url, filename) {
  try {
    const res = await api.get(url, { responseType: "blob" });
    const blob = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = blob;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(blob);
  } catch (e) {
    toast.error("Téléchargement PDF impossible");
  }
}
