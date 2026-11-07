/**
 * Catálogo Progresivo de Lecciones y Escenarios (English Partner)
 * Incluye Examen Diagnóstico Inicial (Placement Test) y 4 pistas temáticas.
 */

const PLACEMENT_TEST_SCENARIO = {
  id: 'placement_test',
  category: 'diagnostic',
  level: 'ALL',
  title: 'Initial Placement Test (Evaluación Diagnóstica Inicial)',
  description: 'Conversación diagnóstica guiada de 7 a 10 minutos. El coach adaptará preguntas desde lo cotidiano hasta situaciones de negocios y dilemas para ubicar tu nivel real (A2, B1, B2 o C1).',
  aiRole: 'Emma, Senior English Assessor & Friendly Coach',
  userRole: 'You (practicing your English naturally)',
  initialGreeting: "Hello! I'm Emma, your English speaking coach. I'm excited to practice with you today! To get started, could you tell me a little bit about yourself, where you're from, and how your day is going?",
  scenarioContext: 'This is a warm diagnostic conversation. Emma starts with relaxed small talk about your daily life and hobbies, then naturally raises the complexity to your career, recent challenges, and hypothetical situations to evaluate grammar depth, vocabulary range, and phonetic clarity.',
  missionObjectives: [
    'Introduce yourself and share what you do and your daily routine.',
    'Discuss a past challenge at work or life and how you solved it.',
    'Express your opinion on a hypothetical scenario or future plan.'
  ],
  targetVocabulary: [
    'In my current role...',
    'Looking back, I realized that...',
    'If I had the chance to...',
    'What I find most rewarding is...',
    'On a regular basis...'
  ],
  systemPromptAddon: `
You are Emma, a warm, encouraging English Assessor. Your goal is to evaluate the user's current spoken English level (A2, B1, B2, or C1).
- Start simple: Ask where they are from, what they do, or about their weekend.
- If they answer easily with good sentence structure, ask a follow-up about a complex situation or past project (testing past tenses and vocabulary).
- Next, challenge them with a hypothetical or opinion question (testing conditionals, passive voice, or nuanced vocabulary).
- Maintain a completely natural, supportive conversation. Do not critique them during the conversation; keep them talking!
- If they make small mistakes, don't interrupt. Keep the dialogue flowing.
`
};

const CURRICULUM_SCENARIOS = [
  // ==========================================
  // PISTA 1: CHARLA Y CONVERSACIÓN RELAJADA (CASUAL)
  // ==========================================
  {
    id: 'casual_01',
    category: 'casual',
    level: 'A2',
    title: 'Weekend Catch-Up at a Park',
    description: 'Conversación distendida de lunes: contar qué hiciste el fin de semana, planes y anécdotas ligeras.',
    aiRole: 'Liam, an easygoing friend you run into at the park',
    userRole: 'Friend catching up on life',
    initialGreeting: "Hey! What a nice surprise running into you here. How was your weekend? Did you get up to anything interesting?",
    scenarioContext: 'You meet Liam while grabbing coffee near the park. He asks how your weekend went and what you have planned for this week.',
    missionObjectives: [
      'Describe at least 2 activities you did over the weekend (using past tense).',
      'Ask Liam about his own weekend plans or hobbies.',
      'Suggest meeting up again soon.'
    ],
    targetVocabulary: [
      'I ended up doing...',
      'To be honest...',
      'How did your weekend go?',
      'I was planning on...',
      'We should definitely catch up!'
    ],
    systemPromptAddon: 'Act as Liam, a warm, relaxed friend. Talk casually, react with enthusiasm, and use everyday American expressions.'
  },
  {
    id: 'casual_02',
    category: 'casual',
    level: 'B1',
    title: 'Sharing Travel Stories & Dream Destinations',
    description: 'Platicar sobre tus mejores viajes, experiencias inesperadas y destinos que sueñas visitar.',
    aiRole: 'Chloe, a fellow traveler sharing travel stories',
    userRole: 'A passionate traveler sharing experiences',
    scenarioContext: 'You and Chloe are waiting for a train and start swapping stories about memorable trips, culture shocks, and travel tips.',
    missionObjectives: [
      'Describe a memorable trip you took in the past and what made it special.',
      'Explain a travel mishap or unexpected surprise you faced.',
      'Discuss a place you would love to visit next and why.'
    ],
    targetVocabulary: [
      'What caught my attention was...',
      'It turned out that...',
      'Off the beaten path',
      'I have always wanted to explore...',
      'Culture shock'
    ],
    systemPromptAddon: 'Act as Chloe, energetic and curious about travel. Ask engaging questions about sights, food, and culture.'
  },
  {
    id: 'casual_03',
    category: 'casual',
    level: 'B2',
    title: 'Debating Tech & Social Media Habits',
    description: 'Conversación relajada pero analítica sobre el impacto de los smartphones y la IA en la vida diaria.',
    aiRole: 'Alex, a tech-savvy friend with balanced perspectives',
    userRole: 'Friend exchanging thoughts on modern habits',
    scenarioContext: 'You and Alex are having coffee discussing whether people are spending too much screen time and how AI is changing routine tasks.',
    missionObjectives: [
      'State your personal perspective on screen time with concrete examples.',
      'Respond to a counter-argument politely.',
      'Synthesize common ground or practical advice.'
    ],
    targetVocabulary: [
      'From my standpoint...',
      'It is a double-edged sword',
      'I see where you are coming from, but...',
      'To strike a balance',
      'Mindless scrolling'
    ],
    systemPromptAddon: 'Act as Alex. Present thoughtful but friendly viewpoints. Prompt the user to elaborate with "Why do you think that is?"'
  },

  // ==========================================
  // PISTA 2: LENGUAJE DE NEGOCIOS (BUSINESS ENGLISH)
  // ==========================================
  {
    id: 'business_01',
    category: 'business',
    level: 'B1',
    title: 'Daily Stand-Up & Project Status Update',
    description: 'Reportar qué completaste ayer, en qué estás trabajando hoy y comunicar cualquier bloqueo.',
    aiRole: 'Marcus, Project Manager running the morning sync',
    userRole: 'Team lead / Contributor reporting progress',
    scenarioContext: 'It is 9:15 AM. Marcus is moderating the 10-minute sprint standup. You need to present your update clearly and concisely.',
    missionObjectives: [
      'Summarize what you accomplished yesterday.',
      'State clearly what deliverables you are focusing on today.',
      'Flag any potential blocker or request assistance from a colleague.'
    ],
    targetVocabulary: [
      'I managed to wrap up...',
      'My top priority today is...',
      'I am currently blocked by...',
      'Let us take this offline',
      'On track to deliver'
    ],
    systemPromptAddon: 'Act as Marcus, an organized PM. Keep the pace crisp, ask for deadlines when necessary, and acknowledge updates professionally.'
  },
  {
    id: 'business_02',
    category: 'business',
    level: 'B2',
    title: 'Negotiating Project Deadlines & Priorities',
    description: 'Defender un plazo realista frente a un directivo que pide adelantar la entrega sin sacrificar calidad.',
    aiRole: 'Victoria, VP of Operations requesting an earlier delivery',
    userRole: 'Project Owner balancing scope and delivery date',
    scenarioContext: 'Victoria wants the new phase launched two weeks ahead of schedule. You must negotiate scope trade-offs without saying a flat "no".',
    missionObjectives: [
      'Acknowledge the business urgency empathetically.',
      'Propose a trade-off (deliver core features first, secondary features later).',
      'Agree on a mutually beneficial timeline.'
    ],
    targetVocabulary: [
      'I completely understand the urgency, however...',
      'To ensure quality and avoid technical debt...',
      'What if we phase the rollout?',
      'A viable middle ground would be...',
      'Let us align on the minimum viable scope'
    ],
    systemPromptAddon: 'Act as Victoria, a sharp executive. You are tough but fair and respect well-argued trade-offs and data.'
  },
  {
    id: 'business_03',
    category: 'business',
    level: 'C1',
    title: 'Budget Review & Justifying New Resources',
    description: 'Defender el presupuesto y justificar la contratación de nuevo personal o herramientas tecnológicas.',
    aiRole: 'David, Chief Financial Officer (CFO)',
    userRole: 'Department Director presenting the business case',
    scenarioContext: 'You are meeting with CFO David to justify a 15% budget expansion for modern tooling and senior talent.',
    missionObjectives: [
      'Present the ROI (Return on Investment) of the requested budget.',
      'Address the risk of maintaining the status quo (cost of inaction).',
      'Secure David approval for a pilot phase or phased disbursement.'
    ],
    targetVocabulary: [
      'The cost of inaction outweighs the investment',
      'Measurable return on investment (ROI)',
      'Mitigate downstream operational friction',
      'Proof of concept (PoC)',
      'To optimize our operational runway'
    ],
    systemPromptAddon: 'Act as David, a fiscally prudent CFO. Ask probing questions about numbers, timelines, and contingencies.'
  },

  // ==========================================
  // PISTA 3: CITAS CON CLIENTES (CLIENT MEETINGS & SALES)
  // ==========================================
  {
    id: 'client_01',
    category: 'client',
    level: 'B1',
    title: 'Discovery Call with a Prospective Client',
    description: 'Primera llamada de descubrimiento: romper el hielo, hacer preguntas abiertas y entender el dolor del cliente.',
    aiRole: 'Rachel, Operations Lead at a growing retail company',
    userRole: 'Solution Consultant conducting a discovery session',
    scenarioContext: 'Rachel booked a 10-minute discovery call to evaluate if your services can solve their operational bottlenecks.',
    missionObjectives: [
      'Build rapport and establish a clear meeting agenda.',
      'Ask 2-3 open-ended questions about their current workflow bottlenecks.',
      'Summarize Rachel key points to show active listening.'
    ],
    targetVocabulary: [
      'The purpose of our call today is to...',
      'Could you walk me through your current process?',
      'What seems to be the biggest bottleneck?',
      'If I understand correctly, your main priority is...',
      'How is this impacting your team daily?'
    ],
    systemPromptAddon: 'Act as Rachel. You are interested but busy. Answer with practical details and appreciate consultants who ask smart questions.'
  },
  {
    id: 'client_02',
    category: 'client',
    level: 'B2',
    title: 'Handling Price Objections & Demonstrating Value',
    description: 'El cliente dice que tu propuesta es más cara que la competencia. Debes validar el precio mediante valor y garantías.',
    aiRole: 'Carlos, Procurement Manager comparing supplier quotes',
    userRole: 'Account Executive defending premium pricing',
    scenarioContext: 'Carlos likes your solution, but states that competitor XYZ submitted a quote 20% lower.',
    missionObjectives: [
      'Validate the client budget concern without discounting immediately.',
      'Highlight 2 distinct value differentiators (e.g., support, reliability, time saved).',
      'Offer a flexible payment schedule or milestone structure.'
    ],
    targetVocabulary: [
      'I appreciate your transparency regarding budget',
      'Total cost of ownership (TCO)',
      'What sets our solution apart is...',
      'Rather than competing on price alone...',
      'Milestone-based payment schedule'
    ],
    systemPromptAddon: 'Act as Carlos, a shrewd procurement manager. Push back on price politely to see how the user defends their value.'
  },

  // ==========================================
  // PISTA 4: RESTAURANTES, CAFETERÍAS Y VIAJES
  // ==========================================
  {
    id: 'restaurant_01',
    category: 'restaurants',
    level: 'A2',
    title: 'Ordering at a Busy London Coffee Shop',
    description: 'Pedir café y comida rápida, hacer especificaciones de leche/azúcar y pagar sin titubear.',
    aiRole: 'Sam, a quick and polite London barista',
    userRole: 'Customer ordering morning breakfast',
    scenarioContext: 'It is morning rush hour at a coffee shop near King Cross Station. The barista asks what you would like.',
    missionObjectives: [
      'Order a beverage with 2 custom preferences (size, milk type, temperature).',
      'Ask for a pastry recommendation or dietary info.',
      'Ask to pay by card and request a receipt.'
    ],
    targetVocabulary: [
      'Could I get a medium flat white with oat milk?',
      'Is this pastry dairy-free?',
      'For here or to go?',
      'Can I pay contactless?',
      'Could I have the receipt, please?'
    ],
    systemPromptAddon: 'Act as Sam, a lively barista. Speak clearly with natural British hospitality ("Cheers", "Lovely").'
  },
  {
    id: 'restaurant_02',
    category: 'restaurants',
    level: 'B1',
    title: 'Resolving a Bill Mistake at a Fine Dining Restaurant',
    description: 'Reclamar con diplomacia y cortesía un error en la cuenta de la cena sin confrontación ruda.',
    aiRole: 'Julian, Floor Manager at an upscale bistro',
    userRole: 'Guest reviewing an itemized bill with an error',
    scenarioContext: 'You notice two extra drinks and an unapplied discount on the dinner check. You politely call Julian to clarify.',
    missionObjectives: [
      'Politely call the manager attention without causing a scene.',
      'Point out the discrepancy clearly and calmly.',
      'Accept the corrected invoice and leave an appropriate tip.'
    ],
    targetVocabulary: [
      'Excuse me, I believe there might be a slight mix-up',
      'We were billed for...',
      'Could you take a second look at this item?',
      'Everything else was exquisite',
      'Thank you for clearing that up'
    ],
    systemPromptAddon: 'Act as Julian, a distinguished restaurant manager. Be extremely polite, apologetic, and swift to rectify errors.'
  }
];

const Curriculum = {
  getPlacementTest() {
    return PLACEMENT_TEST_SCENARIO;
  },

  getCategories() {
    return [
      { id: 'all', name: 'Todos los Escenarios' },
      { id: 'casual', name: '☕ Charla Relajada' },
      { id: 'business', name: '💼 Negocios & Equipo' },
      { id: 'client', name: '🤝 Citas con Clientes' },
      { id: 'restaurants', name: '🍽️ Restaurantes & Viajes' }
    ];
  },

  getAllScenarios() {
    return CURRICULUM_SCENARIOS;
  },

  getScenarioById(id) {
    if (id === 'placement_test') {
      return PLACEMENT_TEST_SCENARIO;
    }
    return CURRICULUM_SCENARIOS.find(s => s.id === id) || null;
  },

  getScenariosByCategory(category) {
    if (!category || category === 'all') {
      return CURRICULUM_SCENARIOS;
    }
    return CURRICULUM_SCENARIOS.filter(s => s.category === category);
  },

  /**
   * Genera un escenario personalizado basado en el Banco de Errores del alumno
   */
  getMistakesDrillScenario(userLevel, mistakes = []) {
    const lvl = (userLevel && userLevel !== 'PENDING_PLACEMENT') ? userLevel : 'B1';
    const topCorrections = mistakes.slice(0, 4).map(m => m.correction).filter(Boolean);
    const summaryMistakes = mistakes.slice(0, 5).map(m => `"${m.original}" -> "${m.correction}"`).join('; ');

    return {
      id: 'mistakes_drill',
      category: 'adaptive',
      level: lvl,
      title: '🎯 Práctica Enfocada en Mis Errores (Mistake Vault)',
      description: `Sesión personalizada con Emma para dominar y automatizar las ${mistakes.length} correcciones de gramática y vocabulario detectadas en tus sesiones anteriores.`,
      aiRole: 'Emma, Personal English Coach & Fluency Trainer',
      userRole: 'Student mastering previous corrections in natural conversation',
      initialGreeting: "Welcome back! Today we have a special personalized session. We're going to have a relaxed, engaging chat where we'll naturally put into practice some of the key expressions from your recent sessions. How has your week been going so far?",
      scenarioContext: `This is a targeted fluency workout focused on helping the student naturally use their recent corrected expressions: ${summaryMistakes}.`,
      missionObjectives: [
        'Use the corrected expressions naturally in real sentences.',
        'Maintain fluid conversation at your current level.'
      ],
      targetVocabulary: topCorrections.length > 0 ? topCorrections : [
        'Looking back at...',
        'What I meant to say was...',
        'From my perspective...'
      ],
      systemPromptAddon: `Act as Emma, a supportive personal coach. Create natural conversational situations that prompt the user to use these target corrections: ${summaryMistakes}.`
    };
  },

  /**
   * Ordena los escenarios de forma inteligente según el nivel actual y progreso del usuario
   */
  getScenariosSortedForUser(category, userLevel, completedIds = []) {
    const base = this.getScenariosByCategory(category).slice();
    if (!userLevel || userLevel === 'PENDING_PLACEMENT') {
      return base;
    }

    const levelOrder = ['A2', 'B1', 'B2', 'C1'];
    const userIdx = levelOrder.indexOf(userLevel);

    return base.sort((a, b) => {
      const aRecommended = (a.level === userLevel && !completedIds.includes(a.id)) ? 0 : 1;
      const bRecommended = (b.level === userLevel && !completedIds.includes(b.id)) ? 0 : 1;
      if (aRecommended !== bRecommended) return aRecommended - bRecommended;

      const aMatch = (a.level === userLevel) ? 0 : 1;
      const bMatch = (b.level === userLevel) ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;

      const aDist = Math.abs(levelOrder.indexOf(a.level) - userIdx);
      const bDist = Math.abs(levelOrder.indexOf(b.level) - userIdx);
      return aDist - bDist;
    });
  }
};

