
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "GEMINI_API_KEY belum diatur di Vercel."
    });
  }

  try {
    const { code, mode = "analyze", refineMode = "quality" } =
      req.body || {};

    if (typeof code !== "string" || !code.trim()) {
      return res.status(400).json({
        error: "Kode Luau tidak boleh kosong."
      });
    }

    if (code.length > 30000) {
      return res.status(413).json({
        error: "Kode terlalu panjang. Maksimal 30000 karakter."
      });
    }

    const isRefine = mode === "refine";

    const task = isRefine
      ? `Perbaiki kode Roblox Luau dengan fokus: ${refineMode}.
Pertahankan fungsi utama kode. Perbaiki bug yang jelas, keterbacaan,
dan efisiensi bila sesuai. Jangan mengarang API Roblox.
Kembalikan hanya kode Luau hasil perbaikan.`
      : `Analisis kode Roblox Luau berikut.
Nilai indikator pola kode secara hati-hati; jangan mengklaim bisa
memastikan apakah kode dibuat AI hanya dari gaya penulisan.
Cari masalah bug, keamanan, keterbacaan, dan efisiensi.
Kembalikan JSON valid dengan format:
{
  "score": 0,
  "classification": "Tidak pasti",
  "summary": "Ringkasan analisis",
  "findings": [
    {
      "title": "Judul temuan",
      "severity": "info",
      "detail": "Penjelasan",
      "line": 1
    }
  ]
}
Score harus 0-100. Severity hanya info, low, medium, high.
Jangan bungkus JSON dengan Markdown.`;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `${task}\n\nKODE LUAU:\n${code}`
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.2,
            ...(isRefine
              ? {}
              : { responseMimeType: "application/json" })
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API error:", data);
      return res.status(response.status).json({
        error:
          data?.error?.message ||
          "Permintaan ke Gemini API gagal."
      });
    }

    const output =
      data?.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("")
        .trim();

    if (!output) {
      return res.status(502).json({
        error: "Gemini tidak mengembalikan hasil."
      });
    }

    if (isRefine) {
      const refinedCode = output
        .replace(/^```(?:lua|luau)?\s*/i, "")
        .replace(/\s*```$/i, "");

      return res.status(200).json({ refinedCode });
    }

    let result;

    try {
      result = JSON.parse(output);
    } catch {
      return res.status(502).json({
        error: "Hasil analisis bukan JSON yang valid."
      });
    }

    return res.status(200).json({
      score: Math.max(0, Math.min(100, Number(result.score) || 0)),
      classification: String(result.classification || "Tidak pasti"),
      summary: String(result.summary || "Analisis selesai."),
      findings: Array.isArray(result.findings)
        ? result.findings
        : []
    });
  } catch (error) {
    console.error("Analyze API error:", error);

    return res.status(500).json({
      error: "Terjadi kesalahan internal saat menganalisis kode."
    });
  }
}
