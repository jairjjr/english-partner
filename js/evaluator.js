/**
 * Motor de Evaluación y Diagnóstico Post-Sesión (English Partner)
 * Genera la auditoría forense completa: Gramática, Vocabulario, Pronunciación,
 * Resumen Hablado para el Auto y Calibración CEFR de Nivel.
 */

const Evaluator = {
  /**
   * Analiza una sesión completada y devuelve el reporte estructurado
   */
  async analyzeSession(sessionData, apiKey) {
    const { scenario, history, durationSeconds } = sessionData;
    const isPlacement = (scenario.id === 'placement_test');

    // Filtrar solo los turnos hablados por el usuario
    const userTurns = history.filter(h => h.role === 'user');
    const userFullText = userTurns.map(t => `[Turn ${t.timestamp}s]: ${t.text}`).join('\n');
    const conversationTranscript = history.map(h => `${h.role === 'user' ? 'User' : 'Coach'}: ${h.text}`).join('\n');

    const prompt = `
You are a Staff English Language Auditor and CEFR Examiner.
A student just completed a 10-minute conversational speaking session.

SCENARIO: ${scenario.title} (${scenario.category})
ROLEPLAY CONTEXT: ${scenario.scenarioContext}
IS PLACEMENT TEST: ${isPlacement ? 'YES' : 'NO'}
DURATION: ${Math.round(durationSeconds / 60)} minutes (${durationSeconds} seconds)

COMPLETE CONVERSATION TRANSCRIPT:
${conversationTranscript}

USER'S EXACT SPOKEN TURNS:
${userFullText || '(No clear spoken words detected)'}

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
    { "word": "like", "count": 4 },
    { "word": "um", "count": 6 }
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
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
      const payload = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json'
        }
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Error al evaluar sesión en Gemini (${response.status}): ${await response.text()}`);
      }

      const data = await response.json();
      const rawText = data.candidates[0].content.parts[0].text;
      
      // Parsear JSON limpio
      const parsedReport = JSON.parse(rawText);

      // Asociar audios grabados a los errores de pronunciación si coinciden los timestamps
      if (parsedReport.pronunciationAudit && Array.isArray(parsedReport.pronunciationAudit)) {
        parsedReport.pronunciationAudit = parsedReport.pronunciationAudit.map(item => {
          // Buscar si hay un audio grabado en un turno cercano
          const matchedTurn = userTurns.find(t => Math.abs(t.timestamp - (item.turnTimestamp || 0)) <= 30 && t.audioUrl);
          return {
            ...item,
            userAudioUrl: matchedTurn ? matchedTurn.audioUrl : null
          };
        });
      }

      // Preparar array unificado de mistakes para sincronizar con Google Sheets
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
      // Fallback de contingencia si falla la red o el JSON
      return {
        success: false,
        error: err.message,
        report: this.generateFallbackReport(sessionData)
      };
    }
  },

  /**
   * Reporte de contingencia si la conexión a internet falló en el último segundo
   */
  generateFallbackReport(sessionData) {
    return {
      scores: { grammar: 75, vocabulary: 75, pronunciation: 75, overall: 75 },
      executiveSummary: 'Tu sesión de 10 minutos se guardó localmente. Los detalles se sincronizarán con tu Google Sheet en cuanto recuperes conexión.',
      spokenSummary: 'Great job completing your 10 minute session! Your progress has been safely saved.',
      grammarAudit: [],
      vocabularyAudit: [],
      pronunciationAudit: [],
      mistakes: []
    };
  }
};

