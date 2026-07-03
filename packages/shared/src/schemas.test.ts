import { describe, it, expect } from 'vitest';
import { ProjectSchema, ClaimSchema, EvidenceSchema } from './schemas.js';

describe('Shared Schemas', () => {
  it('should validate a valid project', () => {
    const validProject = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      title: 'Test Project',
      goal: 'Test Goal',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = ProjectSchema.safeParse(validProject);
    expect(result.success).toBe(true);
  });

  it('should fail on invalid project status', () => {
    const invalidProject = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      title: 'Test Project',
      goal: 'Test Goal',
      status: 'invalid_status',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = ProjectSchema.safeParse(invalidProject);
    expect(result.success).toBe(false);
  });

  it('should validate a valid claim', () => {
    const validClaim = {
      id: '550e8400-e29b-41d4-a716-446655440001',
      projectId: '550e8400-e29b-41d4-a716-446655440000',
      ideaVersionId: '550e8400-e29b-41d4-a716-446655440002',
      text: 'Sample Claim',
      type: 'technical',
      requiresEvidence: true,
      criticality: 'high',
      status: 'unverified',
      createdAt: new Date(),
    };
    const result = ClaimSchema.safeParse(validClaim);
    expect(result.success).toBe(true);
  });

  it('should validate valid evidence', () => {
    const validEvidence = {
      id: '550e8400-e29b-41d4-a716-446655440003',
      projectId: '550e8400-e29b-41d4-a716-446655440000',
      title: 'Source Title',
      sourceType: 'academic',
      retrievedAt: new Date(),
      reliability: 'high',
      relevance: 'direct',
      status: 'accepted',
      stalenessRisk: 'low',
      createdAt: new Date(),
    };
    const result = EvidenceSchema.safeParse(validEvidence);
    expect(result.success).toBe(true);
  });
});
