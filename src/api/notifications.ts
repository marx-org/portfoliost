import { http } from "./client"

export interface NotificationsPreferences {
  newsEnabled: boolean
  newsMinActionability: "everything" | "background" | "watch" | "important" | "urgent"
  newsMaterialOnly: boolean
  earningsEnabled: boolean
  insiderEnabled: boolean
  insiderMinValueUsd: number | null
  analystEnabled: boolean
  analystDirection: "all" | "upgrades" | "downgrades"
  channelsWeb: boolean
  channelsPush: boolean
  channelsEmail: boolean
  showDefaultTickers: boolean
}

export interface NotificationSymbol {
  symbol: string
  muted: boolean
  source: "user" | "default"
}

export interface NotificationSymbols {
  items: NotificationSymbol[]
  totalEnabled: number
  totalMuted: number
}

export async function getNotificationsPreferences(): Promise<NotificationsPreferences> {
  return http.get<NotificationsPreferences>("/api/notifications/preferences")
}

export async function updateNotificationsPreferences(
  input: Partial<NotificationsPreferences>,
): Promise<NotificationsPreferences> {
  return http.patch<NotificationsPreferences>("/api/notifications/preferences", input)
}

export async function getNotificationSymbols(): Promise<NotificationSymbols> {
  return http.get<NotificationSymbols>("/api/notifications/symbols")
}

export async function addNotificationSymbol(symbol: string): Promise<NotificationSymbols> {
  return http.post<NotificationSymbols>("/api/notifications/symbols", { symbol })
}

export async function updateNotificationSymbol(symbol: string, muted: boolean): Promise<NotificationSymbols> {
  return http.patch<NotificationSymbols>(`/api/notifications/symbols/${symbol}`, { muted })
}

export async function removeNotificationSymbol(symbol: string): Promise<NotificationSymbols> {
  return http.delete<NotificationSymbols>(`/api/notifications/symbols/${symbol}`)
}
