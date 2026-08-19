import { api, API } from "@/lib/api";
import { toast } from "sonner";

/** Public URL for a stored image path (via /api/public/media?path=...). */
export function publicMediaUrl(path) {
  if (!path) return "";
  if (path.startsWith("http") || path.startsWith("data:")) return path;
  return `${API}/public/media?path=${encodeURIComponent(path)}`;
}

/** Upload an image file to object storage. Returns the storage path. */
export async function uploadImage(file, folder = "blog") {
  if (!file) return null;
  if (file.size > 8 * 1024 * 1024) {
    toast.error("Image trop volumineuse (max 8 Mo)");
    return null;
  }
  const fd = new FormData();
  fd.append("file", file);
  fd.append("folder", folder);
  try {
    const { data } = await api.post("/uploads/image", fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data.path;
  } catch (err) {
    toast.error(err.response?.data?.detail || "Upload impossible");
    return null;
  }
}
