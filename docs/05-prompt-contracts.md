# 05 - Prompt Contracts

## Global prompt rules

Every prompt must instruct the model to return valid JSON only.

Every model output must be validated with Zod.

If the model cannot answer due to missing context, it must return the lazy loading object.

Do not let models invent evidence IDs. Evidence IDs must already exist in the input context unless the task is evidence discovery.

## Shared output rule

Every prompt should include:

```text
Return valid JSON only. Do not include markdown. Do not include explanations outside JSON.
If evidence is required and no evidence is available, mark the claim unsupported or request more context.
```

## 1. Claim Extraction Prompt

Purpose: convert idea version into structured claims, hypotheses, assumptions, and open questions.

Input:

- project goal
- idea version title
- idea version description
- existing claims, if any

Prompt template:

```text
You are extracting researchable claims from an idea version.

Rules:
- Split broad statements into specific claims.
- Mark whether each claim requires evidence.
- Mark criticality.
- Identify assumptions and hypotheses.
- Do not evaluate the idea yet.
- Return valid JSON only.

Project goal:
{{projectGoal}}

Idea version:
{{ideaVersion}}

Existing claims:
{{existingClaims}}

Return schema:
{
  "claims": [
    {
      "text": "",
      "type": "technical | product | market | business | legal | ux | research | risk | assumption",
      "requiresEvidence": true,
      "criticality": "low | medium | high | blocking",
      "reason": ""
    }
  ],
  "hypotheses": [
    {
      "statement": "",
      "whyItMatters": "",
      "requiredEvidenceType": ""
    }
  ],
  "openQuestions": []
}
```

## 2. Research Query Generation Prompt

Purpose: generate search queries for supporting and counter-evidence.

```text
You are generating search queries for evidence retrieval.

Rules:
- Create separate queries for supporting evidence and counter-evidence.
- Prefer primary sources, academic sources, official docs, benchmark reports, and high-quality technical sources.
- Include queries that could disconfirm the claim.
- Return valid JSON only.

Claim:
{{claim}}

Return schema:
{
  "supportingQueries": [],
  "counterEvidenceQueries": [],
  "preferredSourceTypes": [],
  "notes": ""
}
```

## 3. Evidence Assessment Prompt

Purpose: assess source quality.

```text
You are auditing a source used as evidence for a claim.

Rules:
- Evaluate source reliability.
- Evaluate relevance to the claim.
- Evaluate whether the researcher interpreted the source correctly.
- Be strict. A reliable source can still be irrelevant.
- Return valid JSON only.

Claim:
{{claim}}

Evidence:
{{evidence}}

Researcher interpretation:
{{interpretation}}

Return schema:
{
  "reliability": "high | medium | low | unusable",
  "relevance": "direct | indirect | weak | irrelevant",
  "interpretationVerdict": "correctly_used | overstated | misinterpreted | out_of_context | insufficient",
  "detectedProblems": [],
  "notes": "",
  "finalVerdict": "accept | accept_with_caution | reject | irrelevant | needs_better_source"
}
```

## 4. Independent Review Prompt

Purpose: each model evaluates current idea version independently.

```text
You are independently reviewing the current idea version.

Rules:
- Use only the provided evidence IDs.
- Do not accept claims without evidence unless they are explicitly user premises.
- Identify strengths, weaknesses, blocking issues, and missing evidence.
- If context is insufficient, request more context using the specified JSON format.
- Return valid JSON only.

Current idea version:
{{ideaVersion}}

Claims:
{{claims}}

Accepted evidence:
{{acceptedEvidence}}

Counter-evidence:
{{counterEvidence}}

Prior decisions:
{{priorDecisions}}

Return schema:
{
  "needsMoreContext": false,
  "requestedItems": [],
  "verdict": "accept | accept_with_reservations | reject | abstain | needs_more_evidence",
  "strengths": [],
  "weaknesses": [],
  "blockingIssues": [],
  "supportedClaims": [
    {
      "claimId": "",
      "evidenceIds": [],
      "reason": ""
    }
  ],
  "unsupportedClaims": [
    {
      "claimId": "",
      "reason": "",
      "neededEvidence": ""
    }
  ],
  "suggestedRevisions": [],
  "confidence": 0.0
}
```

## 5. Cross Critique Prompt

Purpose: models critique each other’s reviews, evidence use, and reasoning.

```text
You are critiquing other models' reviews and reasoning.

Rules:
- Critiques must target specific IDs.
- Prefer critiques of claims, evidence, source interpretation, unsupported generalization, or missing counter-evidence.
- A critique must explain why it matters.
- Use evidence IDs when possible.
- Return valid JSON only.

Current idea version:
{{ideaVersion}}

Model reviews:
{{modelReviews}}

Claims:
{{claims}}

Evidence pack:
{{evidencePack}}

Evidence assessments:
{{evidenceAssessments}}

Counter-evidence:
{{counterEvidence}}

Return schema:
{
  "critiques": [
    {
      "targetType": "idea | claim | evidence | model_review | reasoning | revision | decision",
      "targetId": "",
      "critiqueType": "contradiction | missing_assumption | weak_evidence | bad_source | misinterpreted_evidence | scope_error | implementation_risk | cost_risk | better_alternative | unsupported_generalization",
      "severity": "low | medium | high | blocking",
      "text": "",
      "whyItMatters": "",
      "proposedFix": "",
      "evidenceIds": []
    }
  ]
}
```

## 6. Critique Response Prompt

Purpose: target model responds to critique and either accepts, partially accepts, rejects, or requests more evidence.

```text
You are responding to a critique of your previous position.

Rules:
- Choose one verdict: accept, partial_accept, reject, needs_more_evidence.
- If accepting, explain exactly how your position changes.
- If rejecting, justify with evidence or reasoning.
- If more evidence is needed, specify what is missing.
- Return valid JSON only.

Your original position:
{{originalPosition}}

Critique:
{{critique}}

Relevant evidence:
{{evidence}}

Counter-evidence:
{{counterEvidence}}

Return schema:
{
  "verdict": "accept | partial_accept | reject | needs_more_evidence",
  "reason": "",
  "positionChange": "none | minor | major",
  "revisedClaim": "",
  "requestedEvidence": []
}
```

## 7. Idea Revision Prompt

Purpose: create a revised idea version from accepted critiques and evidence.

```text
You are revising the idea version based on accepted critiques and evidence.

Rules:
- Do not ignore accepted blocking critiques.
- Do not add unsupported claims as facts.
- Preserve unresolved risks.
- Explicitly list changes from previous version.
- Return valid JSON only.

Current idea version:
{{ideaVersion}}

Accepted critiques:
{{acceptedCritiques}}

Partially accepted critiques:
{{partialCritiques}}

Accepted evidence:
{{acceptedEvidence}}

Counter-evidence:
{{counterEvidence}}

Unresolved risks:
{{unresolvedRisks}}

Return schema:
{
  "title": "",
  "description": "",
  "changesFromPrevious": [],
  "resolvedCritiqueIds": [],
  "remainingRisks": [],
  "newClaims": [],
  "removedClaims": [],
  "revisionRationale": ""
}
```

## 8. Consensus Vote Prompt

Purpose: final model vote on current idea version.

```text
You are voting on whether the current idea version can be accepted.

Rules:
- Vote accept only if critical claims are evidence-backed and no blocking critique remains.
- Vote accept_with_reservations if the idea is usable but risks remain.
- Vote reject if a critical flaw remains.
- Vote needs_more_evidence if evidence is insufficient.
- Return valid JSON only.

Final idea version:
{{ideaVersion}}

Claims:
{{claims}}

Accepted evidence:
{{acceptedEvidence}}

Counter-evidence:
{{counterEvidence}}

Resolved critiques:
{{resolvedCritiques}}

Unresolved risks:
{{unresolvedRisks}}

Decision draft:
{{decisionDraft}}

Return schema:
{
  "vote": "accept | accept_with_reservations | reject | abstain | needs_more_evidence",
  "reason": "",
  "reservations": [],
  "blockingIssues": [],
  "requiredChanges": [],
  "confidence": 0.0
}
```

## 9. Decision Record Prompt

Purpose: create final decision record.

```text
You are writing the final decision record.

Rules:
- Explain why the idea is good.
- Explain why the idea is weak or risky.
- List evidence and counter-evidence IDs.
- List unresolved risks.
- List reopen conditions.
- Do not overstate consensus.
- Return valid JSON only.

Final idea version:
{{ideaVersion}}

Final model votes:
{{modelVotes}}

Claims:
{{claims}}

Evidence:
{{evidence}}

Counter-evidence:
{{counterEvidence}}

Critiques:
{{critiques}}

Critique responses:
{{critiqueResponses}}

Unresolved risks:
{{unresolvedRisks}}

Return schema:
{
  "decisionStatus": "full_consensus | qualified_consensus | no_consensus | insufficient_evidence | needs_external_validation",
  "decisionText": "",
  "whyGood": [],
  "whyBad": [],
  "knownWeaknesses": [],
  "acceptedEvidenceIds": [],
  "counterEvidenceIds": [],
  "resolvedCritiqueIds": [],
  "unresolvedRisks": [],
  "modelFinalVotes": [],
  "reopenConditions": [],
  "nextActions": []
}
```

## 10. Context Audit Prompt

Purpose: verify whether context package is sufficient.

```text
You are auditing whether a model context package is sufficient for the assigned task.

Rules:
- Check whether relevant claims, evidence, counter-evidence, decisions, and critiques are included.
- Mark context too noisy if it includes irrelevant information.
- Return valid JSON only.

Task:
{{task}}

Context manifest:
{{contextManifest}}

Context text:
{{contextText}}

Return schema:
{
  "verdict": "sufficient | missing_relevant_evidence | missing_counter_evidence | missing_prior_decision | too_noisy | too_compressed",
  "missingItems": [],
  "reason": ""
}
```
