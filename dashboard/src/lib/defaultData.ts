import type { PolicyLine } from "../types";

export const defaultPolicyLines: PolicyLine[] = [
  { id: "property", name: "Property", policyCount: 0, policyGoal: 50, premium: 0, premiumGoal: 60000 },
  { id: "casualty", name: "Casualty", policyCount: 0, policyGoal: 50, premium: 0, premiumGoal: 55000 },
  { id: "life", name: "Life", policyCount: 0, policyGoal: 25, premium: 0, premiumGoal: 20000 },
  { id: "commercial", name: "Commercial", policyCount: 0, policyGoal: 20, premium: 0, premiumGoal: 40000 },
  { id: "surplus", name: "Surplus / Other", policyCount: 0, policyGoal: 10, premium: 0, premiumGoal: 15000 },
];
