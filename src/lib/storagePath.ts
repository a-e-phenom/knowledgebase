/** Extract storage object path from a Supabase public object URL. */
export function storageObjectPathFromPublicUrl(publicUrl: string, bucket: string): string | null {
  const marker = `/object/public/${bucket}/`
  const i = publicUrl.indexOf(marker)
  if (i === -1) return null
  const rest = publicUrl.slice(i + marker.length)
  const pathPart = rest.split('?')[0]
  try {
    return decodeURIComponent(pathPart)
  } catch {
    return pathPart
  }
}
