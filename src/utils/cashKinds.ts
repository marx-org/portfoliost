/**
 * Cash kinds the UI can create or edit (§62.8, extended by #245).
 *
 * The server labels a row for the feed (`displayLabel`), but the per-portfolio
 * list and the modal need the same words locally, and the modal's action is not
 * the type: `withdraw` opens the WITHDRAWAL row, `conversion` the FX_CONVERSION
 * one. Declaring the mapping once here is what keeps the table, the tab and the
 * modal from drifting apart.
 */
export type CashAction = "deposit" | "withdraw" | "transfer" | "interest" | "fee" | "conversion"

export const CASH_TYPE_LABELS: Record<string, string> = {
  DEPOSIT: "Deposit",
  WITHDRAWAL: "Withdrawal",
  TRANSFER: "Transfer",
  INTEREST: "Interest",
  FEE: "Fee",
  FX_CONVERSION: "Conversion",
}

/** Which modal opens for which stored type. A correction is a conversion whose
 * two legs are the same currency, so it needs the same form. */
export const EDIT_ACTION: Record<string, CashAction> = {
  WITHDRAWAL: "withdraw",
  TRANSFER: "transfer",
  INTEREST: "interest",
  FEE: "fee",
  FX_CONVERSION: "conversion",
}

export function cashTypeLabel(type: string): string {
  return CASH_TYPE_LABELS[String(type).toUpperCase()] ?? String(type)
}

export function editActionFor(type: string): CashAction {
  return EDIT_ACTION[String(type).toUpperCase()] ?? "deposit"
}
