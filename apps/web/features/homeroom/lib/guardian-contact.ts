/**
 * Turns a stored guardian phone number into a `tel:` link and a WhatsApp
 * `wa.me` link, so the homeroom dashboard's "hubungi wali" action works
 * one tap on a phone without the teacher retyping the number. Numbers are
 * stored however the school entered them (with dashes, spaces, a leading
 * "0" for the domestic dialing prefix), so both helpers normalise first.
 */

/** Strips everything but digits and a leading "+". */
function digitsOnly(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}

export function telHref(phone: string): string {
  return `tel:${digitsOnly(phone)}`;
}

/**
 * wa.me needs a full international number with no leading "+" or "0" --
 * a local Indonesian number's leading "0" is replaced with the country
 * code "62". A number already given in international form (leading "+"
 * or "62") is left as-is.
 */
export function whatsAppHref(phone: string): string {
  const digits = digitsOnly(phone).replace(/^\+/, "");
  const international = digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
  return `https://wa.me/${international}`;
}
