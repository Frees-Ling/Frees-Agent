export function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escapeXmlAttr(s) {
  return escapeXml(s).replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
