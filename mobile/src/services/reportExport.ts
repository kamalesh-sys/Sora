import { Alert } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import { API_BASE_URL } from "../config/api";

export type ReportExportType = "csv" | "pdf";

export async function exportMonthlyReport({
  householdId,
  month,
  token,
  type,
}: {
  householdId?: number;
  month: string;
  token: string;
  type: ReportExportType;
}) {
  const directory = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!directory) {
    throw new Error("File storage is not available on this device.");
  }

  const endpoint = type === "csv" ? "export-csv" : "export-pdf";
  const filename =
    type === "csv"
      ? `${householdId ? `household-${householdId}-` : ""}sora-expenses-${month}.csv`
      : `${householdId ? `household-${householdId}-` : ""}sora-expense-report-${month}.pdf`;
  const basePath = householdId
    ? `${API_BASE_URL}/households/${householdId}/reports/${endpoint}/`
    : `${API_BASE_URL}/reports/${endpoint}/`;

  const result = await FileSystem.downloadAsync(
    `${basePath}?month=${encodeURIComponent(month)}`,
    `${directory}${filename}`,
    { headers: { Authorization: `Token ${token}` } }
  );

  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Export failed with status ${result.status}`);
  }

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(result.uri, {
      dialogTitle: type === "csv" ? "Share CSV report" : "Share PDF report",
      mimeType: type === "csv" ? "text/csv" : "application/pdf",
    });
    return;
  }

  Alert.alert("Export saved", result.uri);
}
