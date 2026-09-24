/**
 * A receipt PDF from `usePaymentReceiptUrlMutation` opens in a new tab by
 * default, which is also how a desktop counter "prints" it (browser print
 * dialog on the PDF). On a device with the Web Share API (most phones and
 * tablets), this instead hands the link to the OS share sheet -- a parent
 * at a counter on a phone can send the receipt straight to WhatsApp
 * without first finding the browser tab.
 */
export async function openOrShareReceipt(url: string, title: string): Promise<void> {
  if (typeof navigator !== "undefined" && "share" in navigator) {
    try {
      await navigator.share({ url, title });
      return;
    } catch {
      // Cancelled by the user, or the platform rejected the share; fall
      // back to opening the tab below so the receipt is still reachable.
    }
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
