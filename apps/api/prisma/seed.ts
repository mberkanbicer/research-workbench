import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { hashPassword } from '../src/utils/password.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

// ─── Default users ────────────────────────────────────────────────────────

async function ensureDefaultUser(email: string, password: string, name: string) {
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        name,
      },
    });
    console.log(`Created user: ${email} / ${password}`);

    // Create a session so they can log in immediately
    const token = generateToken();
    await prisma.authSession.create({
      data: {
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    console.log(`  Session token: ${token}`);
  } else {
    console.log(`User already exists: ${email}`);
  }
  return user;
}

// ─── Adopt orphan projects ────────────────────────────────────────────────

async function adoptOrphanProjects(userId: string) {
  const orphans = await prisma.researchProject.findMany({
    where: { userId: null },
  });
  for (const project of orphans) {
    await prisma.researchProject.update({
      where: { id: project.id },
      data: { userId },
    });
    console.log(`Adopted orphan project: ${project.title} -> user ${userId.slice(0, 8)}`);
  }
  return orphans.length;
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  // 1. Create default users
  console.log('=== Users ===');
  const demoUser = await ensureDefaultUser('demo@example.com', 'demo1234', 'Demo User');
  const adminUser = await ensureDefaultUser('admin@example.com', 'admin1234', 'Admin');

  // 2. Adopt any existing ownerless projects
  console.log('');
  console.log('=== Orphan Projects ===');
  const adopted = await adoptOrphanProjects(demoUser.id);
  console.log(`Adopted ${adopted} ownerless project(s) to ${demoUser.email}`);

  // 3. Models — per user
  console.log('');
  console.log('=== Model Configs ===');
  const mockDataPath = path.join(__dirname, '../../../templates/mock-data.json');
  const mockData = JSON.parse(fs.readFileSync(mockDataPath, 'utf-8'));

  // Clean up any global models (userId=null) left from previous schema
  const globalModels = await prisma.modelConfig.findMany({ where: { userId: null } });
  if (globalModels.length > 0) {
    await prisma.modelConfig.deleteMany({ where: { userId: null } });
    console.log(`Removed ${globalModels.length} global model(s) (migrating to per-user)`);
  }

  // Create models for each default user
  for (const user of [demoUser, adminUser]) {
    for (const modelDef of mockData.models) {
      const existing = await prisma.modelConfig.findFirst({
        where: { name: modelDef.name, userId: user.id },
      });
      if (!existing) {
        await prisma.modelConfig.create({ data: { ...modelDef, userId: user.id } });
        console.log(`Created model "${modelDef.name}" for ${user.email}`);
      }
    }

    const existingOllama = await prisma.modelConfig.findFirst({
      where: { provider: 'ollama', userId: user.id },
    });
    if (!existingOllama) {
      await prisma.modelConfig.create({
        data: {
          name: 'Local Llama 3',
          provider: 'ollama',
          model: 'llama3',
          baseUrl: 'http://localhost:11434',
          contextWindow: 8192,
          preferredMaxInputRatio: 0.5,
          isEnabled: true,
          userId: user.id,
        },
      });
      console.log(`Created local model "Local Llama 3" for ${user.email}`);
    }
  }

  // 4. Demo project
  console.log('');
  console.log('=== Demo Project ===');
  const existingProject = await prisma.researchProject.findFirst({
    where: { title: mockData.demoProject.title },
  });
  if (!existingProject) {
    const project = await prisma.researchProject.create({
      data: {
        title: mockData.demoProject.title,
        goal: mockData.demoProject.goal,
        userId: demoUser.id,
        ideaVersions: {
          create: {
            versionNumber: 1,
            title: 'Initial Idea',
            description: mockData.demoProject.initialIdea,
            status: 'under_review',
          },
        },
      },
    });

    console.log('Seeding initial evidence...');
    for (const evidence of mockData.seedEvidence) {
      await prisma.evidence.create({
        data: {
          projectId: project.id,
          title: evidence.title,
          sourceUrl: evidence.sourceUrl,
          sourceType: evidence.sourceType,
          status: evidence.status,
          stalenessRisk: evidence.stalenessRisk,
        },
      });
    }
    console.log('Demo project created.');
  } else {
    console.log('Demo project already exists, skipping.');
  }

  // ─── Demo Research Projects ─────────────────────────────────────────────
  console.log('');
  console.log('=== Demo Research Projects ===');

  // Helper: create a full project with claims, evidence, critiques, etc.
  async function seedDemoProject(
    ownerUserId: string,
    projectDef: {
      title: string;
      goal: string;
      status?: string;
      staleThresholdDays?: number;
    },
    ideaVersions: Array<{
      versionNumber: number;
      title: string;
      description: string;
      status?: string;
    }>,
    claimsDefs: Array<{
      text: string;
      type: string;
      criticality: string;
      status: string;
      confidence?: number;
    }>,
    evidenceDefs: Array<{
      title: string;
      sourceUrl: string;
      sourceType: string;
      status: string;
      stalenessRisk: string;
      isCounter?: boolean;
      excerpt?: string;
      reliability?: string;
      publishedAt?: Date;
    }>,
    critiqueDefs: Array<{
      targetType: string;
      critiqueType: string;
      severity: string;
      text: string;
      whyItMatters: string;
      proposedFix?: string;
      status?: string;
    }>,
    decisionDefs: Array<{
      decisionStatus: string;
      decisionText: string;
    }>,
    annotationDefs: Array<{
      entityType: string;
      entityId: string; // will be mapped
      content: string;
    }>,
    criteriaDefs: Array<{
      name: string;
      description: string;
      scale?: string;
      weight?: number;
    }>,
  ) {
    const existing = await prisma.researchProject.findFirst({
      where: { title: projectDef.title },
    });
    if (existing) {
      console.log(`Project "${projectDef.title}" already exists, skipping.`);
      return existing;
    }

    // Create project with first idea version
    const project = await prisma.researchProject.create({
      data: {
        title: projectDef.title,
        goal: projectDef.goal,
        status: projectDef.status || 'active',
        staleThresholdDays: projectDef.staleThresholdDays || 180,
        userId: ownerUserId,
      },
    });

    // Create idea versions
    const versions = [];
    for (const v of ideaVersions) {
      const version = await prisma.ideaVersion.create({
        data: {
          projectId: project.id,
          versionNumber: v.versionNumber,
          title: v.title,
          description: v.description,
          status: v.status || 'under_review',
        },
      });
      versions.push(version);
    }
    const latestVersion = versions[versions.length - 1];

    // Create claims linked to latest version
    const claims = [];
    for (const c of claimsDefs) {
      const claim = await prisma.claim.create({
        data: {
          projectId: project.id,
          ideaVersionId: latestVersion.id,
          text: c.text,
          type: c.type,
          criticality: c.criticality,
          status: c.status,
          confidence: c.confidence ?? null,
        },
      });
      claims.push(claim);
    }

    // Create evidence
    const evidenceItems = [];
    for (const e of evidenceDefs) {
      const ev = await prisma.evidence.create({
        data: {
          projectId: project.id,
          title: e.title,
          sourceUrl: e.sourceUrl,
          sourceType: e.sourceType,
          status: e.status,
          stalenessRisk: e.stalenessRisk,
          isCounter: e.isCounter || false,
          excerpt: e.excerpt || null,
          reliability: e.reliability || 'pending',
          publishedAt: e.publishedAt || null,
        },
      });
      evidenceItems.push(ev);
    }

    // Create critiques (link to claims)
    const critiques = [];
    for (let i = 0; i < critiqueDefs.length && i < claims.length; i++) {
      const cd = critiqueDefs[i];
      const critique = await prisma.critique.create({
        data: {
          projectId: project.id,
          ideaVersionId: latestVersion.id,
          criticModelId: 'mock-model',
          targetType: cd.targetType,
          targetId: claims[i].id,
          critiqueType: cd.critiqueType,
          severity: cd.severity,
          text: cd.text,
          whyItMatters: cd.whyItMatters,
          proposedFix: cd.proposedFix || null,
          status: cd.status || 'open',
        },
      });
      critiques.push(critique);
    }

    // Create decisions
    for (const d of decisionDefs) {
      await prisma.decisionRecord.create({
        data: {
          projectId: project.id,
          ideaVersionId: latestVersion.id,
          decisionStatus: d.decisionStatus,
          decisionText: d.decisionText,
        },
      });
    }

    // Create claim dependencies (if 2+ claims)
    if (claims.length >= 2) {
      await prisma.claimDependency.create({
        data: {
          fromClaimId: claims[0].id,
          toClaimId: claims[1].id,
          relation: 'supports',
        },
      });
    }
    if (claims.length >= 3) {
      await prisma.claimDependency.create({
        data: {
          fromClaimId: claims[1].id,
          toClaimId: claims[2].id,
          relation: 'depends_on',
        },
      });
    }

    // Create claim confidence history
    for (let i = 0; i < claims.length; i++) {
      const baseConfidence = claims[i].confidence || 0.5;
      for (let round = 1; round <= 3; round++) {
        await prisma.claimConfidenceHistory.create({
          data: {
            claimId: claims[i].id,
            projectId: project.id,
            confidence: Math.min(1, baseConfidence + (round - 1) * 0.1),
            round,
            reason: `Round ${round} assessment`,
          },
        });
      }
    }

    // Create evaluation criteria and custom scores
    const criteriaItems = [];
    for (const c of criteriaDefs) {
      const criteria = await prisma.evaluationCriteria.create({
        data: {
          projectId: project.id,
          name: c.name,
          description: c.description,
          scale: c.scale || 'low/medium/high',
          weight: c.weight || 1.0,
        },
      });
      criteriaItems.push(criteria);
    }

    // Score evidence against criteria
    for (let i = 0; i < evidenceItems.length && i < 2; i++) {
      for (let j = 0; j < criteriaItems.length && j < 2; j++) {
        const scores = ['low', 'medium', 'high'];
        await prisma.evidenceCustomScore.create({
          data: {
            evidenceId: evidenceItems[i].id,
            criteriaId: criteriaItems[j].id,
            score: scores[(i + j) % 3],
            modelId: 'mock-model',
          },
        });
      }
    }

    // Create annotations (map entityId to actual claim/evidence IDs)
    for (const a of annotationDefs) {
      let actualEntityId = a.entityId;
      if (a.entityType === 'claim' && a.entityId === 'first' && claims[0]) {
        actualEntityId = claims[0].id;
      } else if (a.entityType === 'evidence' && a.entityId === 'first' && evidenceItems[0]) {
        actualEntityId = evidenceItems[0].id;
      } else if (a.entityType === 'claim' && a.entityId === 'second' && claims[1]) {
        actualEntityId = claims[1].id;
      }
      await prisma.annotation.create({
        data: {
          projectId: project.id,
          entityType: a.entityType,
          entityId: actualEntityId,
          authorId: ownerUserId,
          content: a.content,
        },
      });
    }

    // Create a literature review
    await prisma.literatureReview.create({
      data: {
        projectId: project.id,
        title: `Literature Review: ${projectDef.title}`,
        researchQuestion: projectDef.goal,
        status: 'completed',
        findings: [
          { title: 'Key finding 1', relevance: 0.95 },
          { title: 'Key finding 2', relevance: 0.82 },
        ],
        gaps: ['Limited studies on long-term effects', 'Need more controlled experiments'],
        conclusion: 'The evidence supports the core hypothesis with some caveats.',
      },
    });

    // Create a run event
    const runId = crypto.randomUUID();
    const modelConfig = await prisma.modelConfig.findFirst({ where: { isEnabled: true } });
    const modelConfigId = modelConfig?.id || 'mock-model';
    const modelName = modelConfig?.name || 'Mock Researcher';
    const modelProvider = modelConfig?.provider || 'mock';

    await prisma.runEvent.create({
      data: {
        runId,
        projectId: project.id,
        type: 'run.started',
        payload: { modelIds: [modelConfigId], maxRounds: 3, loopMode: 'standard' },
      },
    });

    // Create realistic model calls simulating the deliberation pipeline
    const baseTime = Date.now() - 60000; // 1 minute ago
    const pipeline: Array<{
      stage: string;
      systemPrompt: string;
      userPrompt: string;
      response: string;
      responseJson?: any;
    }> = [
      {
        stage: 'extraction',
        systemPrompt: 'You are an expert research analyst. Extract testable claims from the given research idea. Return a JSON array of claims with text, type, and criticality fields.',
        userPrompt: `Analyze this research idea and extract key claims:\n\nTitle: ${projectDef.title}\nGoal: ${projectDef.goal}`,
        response: `Based on my analysis of "${projectDef.title}", I have extracted ${claims.length} key claims that need evidence evaluation.`,
        responseJson: { claims: claims.map(c => ({ text: c.text, type: c.type, criticality: c.criticality })) },
      },
      {
        stage: 'discovery',
        systemPrompt: 'You are a research librarian. Search for academic evidence supporting or contradicting the given claims. Return relevant sources with titles, URLs, and relevance scores.',
        userPrompt: `Find evidence for these claims:\n${claims.map((c, i) => `${i + 1}. ${c.text}`).join('\n')}`,
        response: `I found ${evidenceItems.length} relevant sources across academic databases. Here are the most relevant findings:`,
        responseJson: { evidence: evidenceItems.map(e => ({ title: e.title, sourceUrl: e.sourceUrl, relevance: 0.85 })) },
      },
      {
        stage: 'assessment',
        systemPrompt: 'You are a critical evidence assessor. Evaluate the reliability, relevance, and quality of each piece of evidence. Consider methodological rigor, sample size, and potential biases.',
        userPrompt: `Assess the following evidence items:\n${evidenceItems.map((e, i) => `${i + 1}. ${e.title} (${e.sourceType})`).join('\n')}`,
        response: `After careful assessment, I have evaluated ${evidenceItems.length} evidence items. ${evidenceItems.filter(e => e.status === 'accepted').length} are accepted, ${evidenceItems.filter(e => e.status === 'rejected').length} are rejected.`,
      },
      {
        stage: 'review',
        systemPrompt: 'You are a senior research reviewer. Provide a comprehensive review of the research idea, considering novelty, feasibility, impact, and alignment with current state of the art.',
        userPrompt: `Review this research idea:\n\nTitle: ${projectDef.title}\nGoal: ${projectDef.goal}\n\nClaims:\n${claims.map((c, i) => `${i + 1}. [${c.status}] ${c.text}`).join('\n')}`,
        response: `My review of "${projectDef.title}":\n\nStrengths: The idea addresses a meaningful research gap with a clear methodology.\nWeaknesses: Some claims need stronger empirical backing, particularly around scalability.\nVerdict: accept_with_reservations\nConfidence: 0.78`,
        responseJson: { verdict: 'accept_with_reservations', confidence: 0.78, strengths: ['Clear methodology', 'Addresses research gap'], weaknesses: ['Needs more empirical data', 'Scalability concerns'] },
      },
      {
        stage: 'critique',
        systemPrompt: 'You are a constructive critic. Identify logical flaws, unsupported assumptions, missing evidence, and methodological weaknesses in the research claims. Be specific and constructive.',
        userPrompt: `Critique these claims:\n${claims.filter(c => c.status !== 'contradicted').map((c, i) => `${i + 1}. [${c.criticality}] ${c.text}`).join('\n')}\n\nAvailable evidence:\n${evidenceItems.filter(e => e.status === 'accepted').map((e, i) => `${i + 1}. ${e.title}`).join('\n')}`,
        response: `I have identified ${critiques.length} issues across the claims:\n\n1. ${critiques[0]?.text || 'Methodological concerns need addressing'}\n2. ${critiques[1]?.text || 'Evidence base could be stronger'}\n3. ${critiques[2]?.text || 'Consider alternative interpretations'}`,
        responseJson: { critiques: critiques.map(c => ({ text: c.text, severity: c.severity, proposedFix: c.proposedFix })) },
      },
      {
        stage: 'consensus',
        systemPrompt: 'You are a deliberation facilitator. Based on the evidence, reviews, and critiques, provide your final vote on whether this research idea should proceed. Consider all perspectives.',
        userPrompt: `Deliberate on this research proposal:\n\nTitle: ${projectDef.title}\n\nClaims supported: ${claims.filter(c => c.status === 'supported').length}/${claims.length}\nEvidence accepted: ${evidenceItems.filter(e => e.status === 'accepted').length}/${evidenceItems.length}\nCritiques: ${critiques.length} (${critiques.filter(c => c.severity === 'critical' || c.severity === 'high').length} high/critical)\n\nProvide your vote (accept, accept_with_reservations, or reject) with confidence and reasoning.`,
        response: `After reviewing all evidence, critiques, and model reviews, my vote is: accept_with_reservations\n\nConfidence: 0.75\n\nReasoning: The core hypothesis is well-supported by ${claims.filter(c => c.status === 'supported').length} supported claims and ${evidenceItems.filter(e => e.status === 'accepted').length} accepted evidence items. However, ${critiques.filter(c => c.severity === 'high' || c.severity === 'critical').length} critical issues need resolution before full acceptance. The research addresses a meaningful gap and the methodology is sound, but additional validation is recommended.`,
        responseJson: { vote: 'accept_with_reservations', confidence: 0.75, reasoning: 'Well-supported but needs additional validation' },
      },
    ];

    let callTime = baseTime;
    for (const stage of pipeline) {
      const callId = crypto.randomUUID();
      const messages = [
        { role: 'system', content: stage.systemPrompt },
        { role: 'user', content: stage.userPrompt },
      ];

      await prisma.modelCall.create({
        data: {
          id: callId,
          projectId: project.id,
          modelConfigId,
          provider: modelProvider,
          model: modelName,
          messages,
          responseText: stage.response,
          responseJson: stage.responseJson || null,
          usage: { prompt_tokens: 800 + Math.floor(Math.random() * 400), completion_tokens: 200 + Math.floor(Math.random() * 300) },
          status: 'success',
          createdAt: new Date(callTime),
          completedAt: new Date(callTime + 2000 + Math.floor(Math.random() * 3000)),
        },
      });
      callTime += 5000 + Math.floor(Math.random() * 5000);

      // Also create a corresponding run event for this stage
      await prisma.runEvent.create({
        data: {
          runId,
          projectId: project.id,
          type: `phase.${stage.stage}.started`,
          payload: { stage: stage.stage },
          createdAt: new Date(callTime - 4000),
        },
      });
      await prisma.runEvent.create({
        data: {
          runId,
          projectId: project.id,
          type: `phase.${stage.stage}.completed`,
          payload: { stage: stage.stage, count: stage.stage === 'extraction' ? claims.length : stage.stage === 'discovery' ? evidenceItems.length : undefined },
          createdAt: new Date(callTime),
        },
      });
    }

    await prisma.runEvent.create({
      data: {
        runId,
        projectId: project.id,
        type: 'run.completed',
        payload: { outcome: 'success', totalIterations: 1 },
        createdAt: new Date(callTime + 1000),
      },
    });

    console.log(`Created project: ${project.title} (${claims.length} claims, ${evidenceItems.length} evidence, ${critiques.length} critiques)`);
    return project;
  }

  // ── Project 1: NLP — Low-Resource NER ──────────────────────────────────
  await seedDemoProject(
    adminUser.id,
    {
      title: 'Improving Named Entity Recognition for Low-Resource Languages',
      goal: 'Determine whether transfer learning from high-resource NER models can effectively bootstrap NER systems for languages with fewer than 100k annotated tokens.',
    },
    [
      { versionNumber: 1, title: 'Initial Hypothesis', description: 'Transfer learning from English NER can improve F1 by 15%+ on low-resource languages via cross-lingual embeddings.', status: 'superseded' },
      { versionNumber: 2, title: 'Revised After Critique', description: 'Multilingual BERT fine-tuning with as few as 500 labeled examples can achieve competitive NER performance on low-resource African languages.', status: 'under_review' },
    ],
    [
      { text: 'Multilingual BERT cross-lingual transfer achieves 78% F1 on Swahili NER with only 500 labeled examples', type: 'technical', criticality: 'high', status: 'supported', confidence: 0.82 },
      { text: 'Character-level CNNs outperform subword tokenizers for agglutinative languages like Turkish in NER tasks', type: 'technical', criticality: 'medium', status: 'unverified', confidence: 0.55 },
      { text: 'Data augmentation via back-translation does not improve NER for tonal languages due to tone loss', type: 'empirical', criticality: 'high', status: 'contradicted', confidence: 0.3 },
      { text: 'Active learning with uncertainty sampling reduces annotation cost by 60% while maintaining 90% of baseline F1', type: 'methodological', criticality: 'medium', status: 'supported', confidence: 0.75 },
    ],
    [
      { title: 'Cross-lingual transfer for African NER tasks', sourceUrl: 'https://arxiv.org/abs/2301.12345', sourceType: 'academic', status: 'accepted', stalenessRisk: 'low', excerpt: 'We demonstrate that XLM-R achieves strong NER performance across 12 African languages with minimal labeled data.' },
      { title: 'Character-level models for agglutinative NER', sourceUrl: 'https://aclanthology.org/2023.acl-long.456', sourceType: 'academic', status: 'accepted', stalenessRisk: 'low', reliability: 'high', publishedAt: new Date('2023-07-01') },
      { title: 'Back-translation augmentation failures in tonal NER', sourceUrl: 'https://example.test/back-translation-tonal', sourceType: 'preprint', status: 'rejected', stalenessRisk: 'high', isCounter: true, excerpt: 'Our experiments show back-translation destroys tonal information critical for Yoruba NER.' },
      { title: 'Active learning for low-resource NLP annotation', sourceUrl: 'https://example.test/active-learning-nlp', sourceType: 'academic', status: 'accepted', stalenessRisk: 'medium', reliability: 'high' },
      { title: 'Survey of NER methods for under-resourced languages', sourceUrl: 'https://example.test/ner-survey-2024', sourceType: 'report', status: 'pending_review', stalenessRisk: 'medium' },
    ],
    [
      { targetType: 'claim', critiqueType: 'methodological', severity: 'high', text: 'The 500-example claim lacks statistical significance testing. Results may be within noise.', whyItMatters: 'Without significance tests, the 78% F1 claim is unreliable for policy decisions.', proposedFix: 'Add bootstrap confidence intervals and run 5-fold cross-validation.' },
      { targetType: 'claim', critiqueType: 'scope', severity: 'medium', text: 'Evaluation covers only Swahili. Generalization to other Bantu languages is untested.', whyItMatters: 'Swahili has more resources than most African languages, inflating perceived transferability.', proposedFix: 'Test on at least 3 additional languages from different families.' },
      { targetType: 'claim', critiqueType: 'evidence', severity: 'low', text: 'Active learning claim relies on a single dataset benchmark.', whyItMatters: 'Dataset-specific results may not transfer to real-world annotation scenarios.', proposedFix: 'Validate across at least 2 additional NER benchmarks.' },
    ],
    [
      { decisionStatus: 'qualified_consensus', decisionText: 'Proceed with expanded multilingual evaluation. The core approach shows promise but needs broader validation before publication.' },
      { decisionStatus: 'full_consensus', decisionText: 'Include character-level CNN experiments as a separate sub-study within the paper.' },
    ],
    [
      { entityType: 'claim', entityId: 'first', content: 'Key finding — this claim has the strongest empirical backing. Consider leading with it in the paper.' },
      { entityType: 'evidence', entityId: 'first', content: 'Highly relevant. Should be cited as primary evidence for the transfer learning approach.' },
      { entityType: 'claim', entityId: 'second', content: 'Interesting but needs more validation. Could be a secondary contribution.' },
    ],
    [
      { name: 'Methodological Rigor', description: 'How sound is the experimental methodology?', scale: 'weak/moderate/strong', weight: 2.0 },
      { name: 'Novelty', description: 'How novel is the contribution compared to existing work?', scale: 'low/medium/high', weight: 1.5 },
      { name: 'Reproducibility', description: 'Can the results be reproduced with the provided details?', scale: 'poor/good/excellent', weight: 1.0 },
    ],
  );

  // ── Project 2: Climate Science — Carbon Capture ────────────────────────
  await seedDemoProject(
    adminUser.id,
    {
      title: 'Evaluating Direct Air Capture Feasibility for Developing Nations',
      goal: 'Assess whether modular direct air capture (DAC) systems can achieve cost parity with tree-based carbon sequestration in tropical developing countries by 2035.',
      staleThresholdDays: 90,
    },
    [
      { versionNumber: 1, title: 'DAC Cost Reduction Thesis', description: 'Modular DAC units using passive solar regeneration can reduce cost to $80/ton CO2 by 2030.', status: 'superseded' },
      { versionNumber: 2, title: 'Hybrid Approach', description: 'Combining small-scale DAC with biochar production in tropical regions offers the most cost-effective pathway, achieving $60/ton within 8 years.', status: 'accepted' },
      { versionNumber: 3, title: 'Final Proposal', description: 'A hybrid DAC-biochar system deployed at community scale in Sub-Saharan Africa can sequester carbon at $55/ton while creating local economic value through biochar soil amendment.', status: 'under_review' },
    ],
    [
      { text: 'Passive solar DAC regeneration reduces energy cost by 40% compared to conventional electric heating', type: 'technical', criticality: 'high', status: 'supported', confidence: 0.88 },
      { text: 'Biochar co-production offsets 30% of DAC operating costs through agricultural sales', type: 'economic', criticality: 'high', status: 'supported', confidence: 0.79 },
      { text: 'Tropical humidity levels above 80% reduce zeolite-based DAC efficiency by more than 50%', type: 'technical', criticality: 'critical', status: 'unverified', confidence: 0.45 },
      { text: 'Community-scale deployment (1-5 tons/day) achieves better unit economics than industrial scale in low-income regions', type: 'economic', criticality: 'medium', status: 'unverified', confidence: 0.52 },
      { text: 'Current sorbent materials degrade within 2 years in tropical conditions, requiring expensive replacement', type: 'technical', criticality: 'high', status: 'contradicted', confidence: 0.35 },
    ],
    [
      { title: 'Passive solar DAC prototype results', sourceUrl: 'https://nature.com/articles/s41560-023-01234-5', sourceType: 'academic', status: 'accepted', stalenessRisk: 'low', reliability: 'high', excerpt: 'Our passive solar DAC prototype achieved 40% energy reduction in field tests in Rajasthan, India.', publishedAt: new Date('2023-09-15') },
      { title: 'Biochar economics in smallholder farming', sourceUrl: 'https://example.test/biochar-economics', sourceType: 'academic', status: 'accepted', stalenessRisk: 'low', reliability: 'high' },
      { title: 'Zeolite degradation in tropical humidity', sourceUrl: 'https://example.test/zeolite-tropical', sourceType: 'preprint', status: 'pending_review', stalenessRisk: 'high', isCounter: true, excerpt: 'Zeolite 13X shows 60% capacity loss after 18 months at 85% RH and 35°C.' },
      { title: 'Modular DAC deployment case studies', sourceUrl: 'https://example.test/modular-dac-cases', sourceType: 'report', status: 'accepted', stalenessRisk: 'medium' },
      { title: 'Long-term sorbent stability meta-analysis', sourceUrl: 'https://example.test/sorbent-stability', sourceType: 'academic', status: 'accepted', stalenessRisk: 'low', reliability: 'high', publishedAt: new Date('2024-01-20') },
      { title: 'Carbon credit market analysis 2024', sourceUrl: 'https://example.test/carbon-markets-2024', sourceType: 'report', status: 'pending_review', stalenessRisk: 'medium' },
    ],
    [
      { targetType: 'claim', critiqueType: 'feasibility', severity: 'critical', text: 'The 80% humidity claim ignores that most DAC sites would be in semi-arid regions, not tropical forests.', whyItMatters: 'Site selection fundamentally changes the feasibility analysis.', proposedFix: 'Model humidity profiles for candidate deployment regions explicitly.' },
      { targetType: 'claim', critiqueType: 'economic', severity: 'high', text: 'Biochar sales assumptions assume stable agricultural demand which may not hold at scale.', whyItMatters: 'If biochar market saturates, the economic model collapses.', proposedFix: 'Include sensitivity analysis on biochar price volatility.' },
    ],
    [
      { decisionStatus: 'qualified_consensus', decisionText: 'The hybrid approach is promising but requires site-specific humidity and soil analysis before proceeding with pilot deployment.' },
    ],
    [
      { entityType: 'claim', entityId: 'first', content: 'Strong evidence base. This is the cornerstone of the economic argument.' },
      { entityType: 'evidence', entityId: 'first', content: 'Critical reference — but note it was tested in Rajasthan, not tropical Africa.' },
      { entityType: 'claim', entityId: 'third', content: 'BLOCKING ISSUE — must resolve humidity impact before any pilot deployment.' },
      { entityType: 'evidence', entityId: 'third', content: 'This preprint challenges our sorbent assumptions. Needs replication.' },
    ],
    [
      { name: 'Cost-effectiveness', description: 'Does the approach beat $80/ton?', scale: 'no/marginal/yes', weight: 3.0 },
      { name: 'Scalability', description: 'Can this scale to 1M tons/year?', scale: 'unlikely/possible/likely', weight: 2.0 },
      { name: 'Co-benefits', description: 'Does it provide additional value beyond carbon sequestration?', scale: 'none/moderate/significant', weight: 1.5 },
      { name: 'Risk Level', description: 'Technical and market risk assessment', scale: 'high/medium/low', weight: 2.0 },
    ],
  );

  // ── Project 3: Medical AI — Rare Disease Diagnosis ─────────────────────
  await seedDemoProject(
    adminUser.id,
    {
      title: 'AI-Assisted Diagnostic Support for Rare Genetic Disorders',
      goal: 'Evaluate whether multi-modal foundation models can reduce time-to-diagnosis for rare genetic diseases from the current average of 5+ years to under 12 months.',
      staleThresholdDays: 120,
    },
    [
      { versionNumber: 1, title: 'Foundation Model Approach', description: 'GPT-4 class models can match genetic counselor accuracy for rare disease phenotyping from clinical notes.', status: 'superseded' },
      { versionNumber: 2, title: 'Multi-Modal Integration', description: 'Combining clinical text, facial phenotyping (Face2Gene), and genomic data in a retrieval-augmented pipeline achieves 89% top-10 diagnostic accuracy for rare diseases.', status: 'under_review' },
    ],
    [
      { text: 'Multi-modal RAG pipeline achieves 89% top-10 accuracy on rare disease diagnosis from clinical notes + facial features', type: 'technical', criticality: 'critical', status: 'supported', confidence: 0.85 },
      { text: 'Facial phenotyping alone provides 65% of the diagnostic signal for Mendelian disorders', type: 'empirical', criticality: 'high', status: 'supported', confidence: 0.78 },
      { text: 'LLM-based phenotyping from clinical notes has higher accuracy than standardized HPO term extraction', type: 'methodological', criticality: 'high', status: 'unverified', confidence: 0.5 },
      { text: 'Patient-reported outcomes are unreliable as input features for rare disease AI diagnostic systems', type: 'empirical', criticality: 'medium', status: 'contradicted', confidence: 0.4 },
      { text: 'The system reduces average time-to-diagnosis from 5.7 years to 8.3 months in a retrospective cohort of 200 patients', type: 'clinical', criticality: 'critical', status: 'supported', confidence: 0.92 },
      { text: 'Insurance pre-authorization requirements add 3-6 months to the AI-assisted diagnostic pathway', type: 'policy', criticality: 'medium', status: 'unverified', confidence: 0.55 },
    ],
    [
      { title: 'Multi-modal rare disease diagnosis benchmark', sourceUrl: 'https://doi.org/10.1038/s41591-023-02345-6', sourceType: 'academic', status: 'accepted', stalenessRisk: 'low', reliability: 'high', excerpt: 'Our benchmark of 15,000 rare disease cases shows multi-modal approaches significantly outperform text-only methods.', publishedAt: new Date('2023-11-01') },
      { title: 'Face2Gene validation study', sourceUrl: 'https://example.test/face2gene-validation', sourceType: 'academic', status: 'accepted', stalenessRisk: 'low', reliability: 'high' },
      { title: 'LLM phenotyping vs HPO extraction', sourceUrl: 'https://example.test/llm-phenotyping', sourceType: 'preprint', status: 'pending_review', stalenessRisk: 'medium', excerpt: 'GPT-4 extracts clinically relevant phenotypes with 92% precision vs 78% for rule-based HPO extraction.' },
      { title: 'Patient-reported outcomes in rare disease', sourceUrl: 'https://example.test/pro-rare-disease', sourceType: 'academic', status: 'accepted', stalenessRisk: 'low', isCounter: true, reliability: 'high', excerpt: 'PROs correlate strongly with clinical findings (r=0.72) and improve diagnostic accuracy by 12%.' },
      { title: 'Retrospective time-to-diagnosis analysis', sourceUrl: 'https://example.test/time-to-diagnosis', sourceType: 'academic', status: 'accepted', stalenessRisk: 'low', reliability: 'high', publishedAt: new Date('2024-02-10') },
      { title: 'Insurance barriers to AI diagnostics', sourceUrl: 'https://example.test/insurance-ai-dx', sourceType: 'report', status: 'pending_review', stalenessRisk: 'medium' },
      { title: 'Ethical considerations in AI rare disease diagnosis', sourceUrl: 'https://example.test/ethics-ai-rare', sourceType: 'academic', status: 'accepted', stalenessRisk: 'low' },
    ],
    [
      { targetType: 'claim', critiqueType: 'clinical', severity: 'critical', text: 'The 89% accuracy claim is on a curated benchmark, not real-world clinical data with noise and missing values.', whyItMatters: 'Clinical deployment requires robustness to incomplete records, varied formatting, and clinician variability.', proposedFix: 'Validate on a prospective multi-site clinical cohort with realistic data quality.' },
      { targetType: 'claim', critiqueType: 'ethical', severity: 'high', text: 'No mention of bias across ethnic groups. Rare disease databases are skewed toward European populations.', whyItMatters: 'Diagnostic AI trained on biased data could worsen health disparities for underrepresented populations.', proposedFix: 'Include subgroup analysis across ethnic categories and report performance disparities.' },
      { targetType: 'claim', critiqueType: 'practical', severity: 'medium', text: 'Insurance pre-authorization could negate the time savings from AI-assisted diagnosis.', whyItMatters: 'Real-world impact depends on the entire care pathway, not just the diagnostic step.', proposedFix: 'Model the full diagnostic pathway including administrative delays.' },
    ],
    [
      { decisionStatus: 'qualified_consensus', decisionText: 'The technical approach is sound but requires prospective clinical validation and bias audit before any pilot deployment. Prioritize multi-site validation.' },
      { decisionStatus: 'full_consensus', decisionText: 'Mandate fairness evaluation across demographic subgroups as a prerequisite for any publication.' },
    ],
    [
      { entityType: 'claim', entityId: 'first', content: 'Core technical claim. Must be validated prospectively before publication.' },
      { entityType: 'evidence', entityId: 'first', content: 'Primary benchmark reference. Note the curated nature of the dataset.' },
      { entityType: 'claim', entityId: 'fifth', content: 'Strongest clinical evidence. Retrospective but large cohort (n=200).' },
      { entityType: 'evidence', entityId: 'fourth', content: 'Directly contradicts our claim about PROs. Must be addressed in revision.' },
      { entityType: 'claim', entityId: 'sixth', content: 'Policy issue — could be a separate policy brief or supplementary analysis.' },
    ],
    [
      { name: 'Diagnostic Accuracy', description: 'Top-10 diagnostic accuracy on clinical data', scale: 'poor/fair/good/excellent', weight: 3.0 },
      { name: 'Clinical Utility', description: 'Does it meaningfully improve patient outcomes?', scale: 'none/marginal/significant', weight: 2.5 },
      { name: 'Fairness', description: 'Performance equity across demographic groups', scale: 'biased/acceptable/equitable', weight: 2.0 },
      { name: 'Regulatory Readiness', description: 'Compliance with FDA/CE marking requirements', scale: 'not_ready/in_progress/ready', weight: 1.5 },
      { name: 'Implementation Feasibility', description: 'Can it be deployed in clinical workflows?', scale: 'difficult/moderate/easy', weight: 1.0 },
    ],
  );

  console.log('');
  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
