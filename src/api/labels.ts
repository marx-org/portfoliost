import { http } from "./client"
import type { components } from "../../generated/api-types"

export type Label = components["schemas"]["Label"]
export type SetLabelsRequest = components["schemas"]["SetLabelsRequest"]

export function getLabels(): Promise<Label[]> {
  return http.get<Label[]>("/api/labels")
}

export function createLabel(input: { name: string; color?: string }): Promise<Label> {
  return http.post<Label>("/api/labels", input)
}

export function updateLabel(id: string, patch: { name?: string; color?: string }): Promise<Label> {
  return http.patch<Label>(`/api/labels/${id}`, patch)
}

export function deleteLabel(id: string): Promise<void> {
  return http.delete<void>(`/api/labels/${id}`)
}

export function setPositionLabels(positionId: string, labelIds: string[]): Promise<Label[]> {
  return http.post<Label[]>(`/api/positions/${positionId}/labels`, { labelIds })
}

export function setTransactionLabels(
  portfolioId: string,
  transactionId: string,
  labelIds: string[],
): Promise<Label[]> {
  return http.post<Label[]>(`/api/portfolios/${portfolioId}/transactions/${transactionId}/labels`, {
    labelIds,
  })
}

export function setCashTransactionLabels(
  transactionId: string,
  req: { labelIds: string[] },
): Promise<Label[]> {
  return http.post<Label[]>(`/api/portfolios/cash/transactions/${transactionId}/labels`, req)
}
