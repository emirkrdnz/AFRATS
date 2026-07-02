using System.Globalization;
using NotificationService.Application.Interfaces.Services;

namespace NotificationService.Infrastructure.Services;

// Severity-aware notification copy. Eski tek-template yaklaşımı tüm
// HighRisk'lere "Your financial risk score has reached X" diyordu — kullanıcı
// "Critical" ile "Mild" arasındaki farkı title'dan ayırt edemiyordu. Yeni:
// title + body severity bandına göre tone shift yapar (Mild→neutral,
// Notable→warning, Critical→urgent). AnomalyAlert için aynı mantık +
// action context (category, amount, date) UUID'in yerini alır.
public class NotificationTemplateService : INotificationTemplateService
{
    // TRY currency format — turkish locale, "TRY 25.000,00" formatı
    // backend'in default ToString'inden daha okunabilir. Invariant culture
    // ile decimal separator deterministic kalır (template testleri stable).
    private static readonly CultureInfo TR = new("tr-TR");

    // ── Anomaly severity (anomaly_score) ─────────────────────────────────
    // ≥0.9 → Critical (kırmızı bayrak)
    // 0.7-0.9 → Notable (sarı bayrak)
    // <0.7 → Mild (info)
    public string GenerateAnomalyAlertTitle(double anomalyScore)
    {
        if (anomalyScore >= 0.9) return "Highly Unusual Transaction";
        if (anomalyScore >= 0.7) return "Unusual Transaction Flagged";
        return "Mild Anomaly Detected";
    }

    public string GenerateAnomalyAlertMessage(
        Guid transactionId,
        double anomalyScore,
        double riskScore,
        string? categoryName,
        decimal? amount,
        string? description,
        DateTime? transactionDate)
    {
        // Context-first: ne işlem, ne kadar, ne zaman. Eğer event eski format
        // (context yok) ise fallback eski generic mesaj (graceful rolling deploy).
        var hasContext = !string.IsNullOrWhiteSpace(categoryName)
                         && amount.HasValue
                         && transactionDate.HasValue;

        if (!hasContext)
        {
            return $"Transaction {transactionId} was flagged as anomalous. " +
                   $"Anomaly score: {anomalyScore:F2}, Risk score: {riskScore:F1}. " +
                   $"Click for details.";
        }

        // "Education — TRY 8.000,00 on 12 May 2026"
        var headline = $"{categoryName} — TRY {amount!.Value.ToString("N2", TR)} " +
                       $"on {transactionDate!.Value:dd MMM yyyy}";

        // Description varsa parantezde ekle (kullanıcı açıklamasını verdiyse)
        var withDesc = string.IsNullOrWhiteSpace(description)
            ? headline
            : $"{headline} ({description.Trim()})";

        // Severity-based suffix — anomaly skoru ne kadar yüksekse ton sertleşir
        var severitySuffix = anomalyScore >= 0.9
            ? $"Highly anomalous (score {anomalyScore:F2}) — review immediately."
            : anomalyScore >= 0.7
                ? $"Notable deviation (score {anomalyScore:F2}) — verify if intentional."
                : $"Mild signal (score {anomalyScore:F2}) — likely fine, take a quick look.";

        return $"{withDesc}. {severitySuffix}";
    }

    // ── High risk severity (risk_score) ──────────────────────────────────
    // ≥90 → Critical (acil)
    // 80-90 → High (review)
    // 70-80 → Elevated (watch)
    public string GenerateHighRiskTitle(double riskScore)
    {
        if (riskScore >= 90) return "Critical Risk Level";
        if (riskScore >= 80) return "High Risk Alert";
        return "Risk Level Elevated";
    }

    public string GenerateHighRiskMessage(double riskScore, string riskLevel, double previousScore)
    {
        // Delta hesabı — bir önceki score'dan ne kadar yukarı? "first time"
        // edge case'i: previous=0 olduğunda jump göstermek anlamsız.
        var delta = riskScore - previousScore;
        var deltaTxt = previousScore > 0 && Math.Abs(delta) >= 1
            ? $" (up {delta:F1} from {previousScore:F1})"
            : "";

        if (riskScore >= 90)
        {
            return $"Critical risk score {riskScore:F1}{deltaTxt}. " +
                   "Take immediate action — significant deviation detected.";
        }
        if (riskScore >= 80)
        {
            return $"Risk reached {riskScore:F1} ({riskLevel}){deltaTxt}. " +
                   "Review recent activity and adjust spending if needed.";
        }
        // 70-80 → soft warning
        return $"Risk has crept up to {riskScore:F1} ({riskLevel}){deltaTxt}. " +
               "Keep an eye on recent activity.";
    }

    public string GenerateHighRiskEmailSubject(double riskScore)
        => riskScore >= 90
            ? $"AFRATS — CRITICAL Risk Alert ({riskScore:F1})"
            : $"AFRATS — High Risk Alert: Your Risk Score is {riskScore:F1}";

    public string GenerateHighRiskEmailBody(
        Guid userId,
        double riskScore,
        string riskLevel,
        Guid transactionId,
        double previousScore,
        string? categoryName = null,
        decimal? amount = null,
        string? description = null,
        DateTime? transactionDate = null)
    {
        // Triggering Transaction satırı: context varsa "Grocery — TRY 25.000,00
        // on 05 Jun 2026" + opsiyonel description. Yoksa eski UUID (rolling
        // deploy / context'siz event'ler için fallback). HTML-escape category
        // & description çünkü kullanıcı girdisi içerebilir (XSS yüzeyi).
        var triggerCell = (!string.IsNullOrWhiteSpace(categoryName)
                          && amount.HasValue
                          && transactionDate.HasValue)
            ? FormatTriggerHtml(categoryName!, amount!.Value, transactionDate!.Value, description)
            : System.Net.WebUtility.HtmlEncode(transactionId.ToString());

        const string template = @"<!DOCTYPE html>
<html lang=""en"">
<head>
<meta charset=""UTF-8"">
<style>
body { font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; }
.header { background-color: #dc3545; color: white; padding: 20px; text-align: center; }
.content { padding: 24px; }
.badge { display: inline-block; background: #dc3545; color: white; padding: 8px 16px; border-radius: 4px; font-size: 20px; font-weight: bold; }
.tbl { width: 100%; border-collapse: collapse; margin: 16px 0; }
.tbl td { padding: 8px; border-bottom: 1px solid #eee; }
.tbl td:first-child { font-weight: bold; color: #555; width: 40%; }
.tx-desc { color: #777; font-size: 12px; font-style: italic; margin-top: 4px; }
.footer { background: #f8f9fa; padding: 16px; text-align: center; font-size: 12px; color: #777; }
</style>
</head>
<body>
<div class=""header""><h2>Financial Risk Alert</h2></div>
<div class=""content"">
  <p>Your financial risk score has reached a critical level.</p>
  <p>Current Risk Score: <span class=""badge"">RISK_SCORE -- RISK_LEVEL</span></p>
  <table class=""tbl"">
    <tr><td>Triggering Transaction</td><td>TRIGGER_CELL</td></tr>
    <tr><td>Previous Score</td><td>PREVIOUS_SCORE</td></tr>
    <tr><td>Current Score</td><td>RISK_SCORE</td></tr>
    <tr><td>Risk Level</td><td>RISK_LEVEL</td></tr>
  </table>
  <p>We recommend reviewing your spending patterns.</p>
</div>
<div class=""footer"">
  This email was sent automatically by the AFRATS system.<br>
  You can manage your notification preferences in Profile &gt; Settings.
</div>
</body>
</html>";

        return template
            .Replace("RISK_SCORE", riskScore.ToString("F1"))
            .Replace("RISK_LEVEL", riskLevel)
            .Replace("TRIGGER_CELL", triggerCell)
            .Replace("PREVIOUS_SCORE", previousScore.ToString("F1"));
    }

    // Triggering Transaction hücresinin HTML'ini hazırlar:
    //   "Grocery — TRY 60.000,00 on 05 Jun 2026"
    //   "  italic description varsa ikinci satırda  "
    // Kullanıcı girdisi (categoryName, description) HTML-escape edilir.
    private static string FormatTriggerHtml(
        string categoryName,
        decimal amount,
        DateTime transactionDate,
        string? description)
    {
        var cat       = System.Net.WebUtility.HtmlEncode(categoryName);
        var amountStr = amount.ToString("N2", TR);
        var dateStr   = transactionDate.ToString("dd MMM yyyy");
        var headline  = $"{cat} — TRY {amountStr} on {dateStr}";

        if (string.IsNullOrWhiteSpace(description))
            return headline;

        var desc = System.Net.WebUtility.HtmlEncode(description.Trim());
        return $"{headline}<div class=\"tx-desc\">{desc}</div>";
    }
}