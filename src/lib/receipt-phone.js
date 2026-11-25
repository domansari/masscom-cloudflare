export function receiptPhone(value) {
  const raw = String(value ?? "").trim();
  if (!/^\+?[\d ()-]+$/.test(raw)) return "";
  const digits = raw.replace(/\D/g, "");
  if (!raw.startsWith("+") && /^[6-9]\d{9}$/.test(digits)) return "91" + digits;
  return (raw.startsWith("+") || /^91\d{10}$/.test(digits)) && /^[1-9]\d{7,14}$/.test(digits) ? digits : "";
}
