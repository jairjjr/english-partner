/**
 * Motor de Evaluación y Diagnóstico Post-Sesión (English Partner v5)
 * Utiliza los modelos oficiales verificados de Google AI Studio:
 * 1. gemini-flash-lite-latest
 * 2. gemini-flash-latest
 * 3. gemini-pro-latest
 */

const Evaluator = {
  async analyzeSession(sessionData, apiKey) {
    const { scenario, history, durationSeconds } = sessionData;
    const isPlacement = (scenario.id === 'placement_test');

    const userTurns = history.filter(h => h.role === 'user');
    const userFullText = userTurns.map(t => `[Turn ${t.timestamp}s]: ${t.text}`).join('\n');
    const conversationTranscript = history.map(h => `${h.role === 'user' ? 'User' : 'Coach'}: ${h.text}`).join('\n');

    const prompt = `
You are a Staff English Language Auditor and CEFR Examiner.
A student just completed a conversational speaking session.

SCENARIO: ${scenario.title} (${scenario.category})
ROLEPLAY CONTEXT: ${scenario.scenarioContext}
IS PLACEMENT TEST: ${isPlacement ? 'YES' : 'NO'}
DURATION: ${Math.round(durationSeconds / 60)} minutes (${durationSeconds} seconds)

COMPLETE CONVERSATION TRANSCRIPT:
${conversationTranscript}

USER'S EXACT SPOKEN TURNS:
${userFullText || '(Speaking practice completed)'}

Perform an exhaustive, constructive, high-fidelity audit.
Respond EXCLUSIVELY with a valid JSON object matching this schema without markdown codeblocks or backticks:
{
  "scores": {
    "grammar": 85,
    "vocabulary": 80,
    "pronunciation": 82,
    "overall": 82
  },
  "placement": {
    "assignedLevel": "B2",
    "rationale": "Breve explicación en español de por qué se asignó este nivel CEFR."
  },
  "executiveSummary": "Resumen ejecutivo en español de 2 párrafos sobre el desempeño global.",
  "spokenSummary": "Resumen conciso de 45-60 segundos en inglés y español para ser leído en voz alta por el coach mientras el alumno conduce en su auto.",
  "grammarAudit": [
    {
      "original": "Frase exacta que dijo el usuario",
      "corrected": "Versión corregida natural",
      "explanation": "Explicación clara en español de la regla gramatical violada",
      "rule": "Nombre de la regla (ej: Present Perfect vs Simple Past, Prepositions, Subject-Verb Agreement)"
    }
  ],
  "vocabularyAudit": [
    {
      "original": "Frase dicha por el usuario",
      "nativeAlternative": "Alternativa como hablaría un nativo informal",
      "businessAlternative": "Alternativa ejecutiva/profesional",
      "reason": "Por qué esta alternativa suena con más maestría"
    }
  ],
  "fillerWords": [
    { "word": "like", "count": 2 },
    { "word": "um", "count": 3 }
  ],
  "pronunciationAudit": [
    {
      "word": "Palabra dicha",
      "ipa": "/ˈskedʒuːl/",
      "figuredPronunciation": "es-kéd-yul",
      "phoneticTip": "Consejo de articulación en español (posición de lengua/labios/acento tónico)",
      "turnTimestamp": 120
    }
  ],
  "strengths": [
    "Punto fuerte 1 demostrado en la sesión",
    "Punto fuerte 2 demostrado en la sesión"
  ],
  "homeworkChallenge": "Un micro-desafío concreto para la siguiente sesión de 10 minutos."
}
`;

    try {
      const candidateModels = ['gemini-flash-lite-latest', 'gemini-flash-latest', 'gemini-pro-latest'];
      let data = null;
      let lastError = null;

      const payload = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json'
        }
      };

      for (const model of candidateModels) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          if (response.status === 503 || response.status === 429) {
            console.warn(`[Evaluator] Modelo ${model} ocupado. Reintentando...`);
            await new Promise(r => setTimeout(r, 500));
            continue;
          }

          if (!response.ok) {
            throw new Error(`Status ${response.status} (${model}): ${await response.text()}`);
          }

          data = await response.json();
          if (data.candidates && data.candidates[0] && data.candidates[0].content) break;
        } catch (err) {
          lastError = err;
        }
      }

      if (!data) {
        throw lastError || new Error('No se pudo generar la evaluación en este momento.');
      }

      const rawText = data.candidates[0].content.parts[0].text;
      const parsedReport = JSON.parse(rawText);

      if (parsedReport.pronunciationAudit && Array.isArray(parsedReport.pronunciationAudit)) {
        parsedReport.pronunciationAudit = parsedReport.pronunciationAudit.map(item => {
          const matchedTurn = userTurns.find(t => Math.abs(t.timestamp - (item.turnTimestamp || 0)) <= 30 && t.audioUrl);
          return {
            ...item,
            userAudioUrl: matchedTurn ? matchedTurn.audioUrl : null
          };
        });
      }

      const mistakes = [];
      if (Array.isArray(parsedReport.grammarAudit)) {
        parsedReport.grammarAudit.forEach(g => {
          mistakes.push({
            type: 'GRAMMAR',
            original: g.original,
            correction: g.corrected,
            explanation: g.explanation
          });
        });
      }
      if (Array.isArray(parsedReport.pronunciationAudit)) {
        parsedReport.pronunciationAudit.forEach(p => {
          mistakes.push({
            type: 'PRONUNCIATION',
            original: p.word,
            correction: `${p.ipa} (${p.figuredPronunciation})`,
            explanation: p.phoneticTip
          });
        });
      }

      parsedReport.mistakes = mistakes;

      return {
        success: true,
        report: parsedReport
      };
    } catch (err) {
      console.error('[Evaluator] Error generando reporte:', err);
      return {
        success: false,
        error: err.message,
        report: this.generateFallbackReport(sessionData)
      };
    }
  },

  generateFallbackReport(sessionData) {
    return {
      scores: { grammar: 80, vocabulary: 80, pronunciation: 80, overall: 80 },
      executiveSummary: 'Tu sesión se completó con éxito. Los datos se guardaron en tu Google Sheet.',
      spokenSummary: 'Great job completing your speaking session! Your progress has been safely saved.',
      grammarAudit: [],
      vocabularyAudit: [],
      pronunciationAudit: [],
      mistakes: []
    };
  }
};

