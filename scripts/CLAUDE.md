# Agent Execution Rules

## 1. Core Principle
Make the smallest correct change that fully solves the problem.

---

# GLOBAL ENGINEERING RULES (Apply to any project)

## 2. Understand Before Acting
- Read relevant files before making changes
- Understand data flow and dependencies
- Never assume APIs, schemas, or contracts

---

## 3. Scope Discipline
- Modify only what is required
- Avoid touching unrelated files
- Do not refactor unless explicitly requested

---

## 4. Simplicity Over Cleverness
- Prefer simple, readable solutions
- Avoid unnecessary abstractions
- Do not introduce new patterns without need

---

## 5. Consistency
- Follow existing patterns in:
  - naming
  - structure
  - architecture
- Do not introduce parallel ways of doing the same thing

---

## 6. Safety First
- Avoid destructive actions
- Avoid irreversible changes
- Ensure changes are easy to revert

---

## 7. Validation Required
Before declaring "done":
- Ensure logic is correct
- Ensure no obvious runtime issues
- Ensure TypeScript/build consistency
- If uncertain → explicitly say so

---

## 8. Communication Rules
Responses must include:
1. What changed
2. Why
3. Files modified
4. Risks or assumptions

Keep concise but informative.

---

## 9. When to Stop
Stop and ask if:
- Requirements are unclear
- Multiple interpretations exist
- Change affects critical systems
- You are making assumptions

---

# HAUSDAME-SPECIFIC RULES

## 10. Critical Systems (DO NOT TOUCH WITHOUT EXPLICIT INSTRUCTION)
- Prisma schema & migrations
- iCal sync / cron logic
- Assignment system
- Tareas Pro job generation
- Inventory core relationships

---

## 11. Data Integrity Rules
- Never delete or reset data
- Never modify historical records logic
- Preserve idempotency and snapshot behaviors

---

## 12. Assignment Model
- `assignedMembershipId` is the source of truth
- Do not reintroduce legacy assignment logic

---

## 13. Tareas Pro Constraints
- Do not break:
  - snapshot integrity
  - occurrenceKey uniqueness
  - carry-forward logic
- Do not regenerate jobs unless explicitly required

---

## 14. Incremental Changes Only
- Prefer small, isolated changes
- Avoid multi-system changes in one step

---

## 15. UX Stability
- Do not alter UX behavior unless requested
- Preserve flows and user expectations

---

## 16. Anti-Patterns (Forbidden)
- Refactoring unrelated code
- Making assumptions
- Overengineering
- Touching multiple systems unnecessarily
- Declaring completion without validation

---

## 17. Success Criteria
A correct solution:
- Solves the problem completely
- Does not introduce side effects
- Matches existing architecture
- Is minimal and reversible

## 18. Modes of Operation (CRITICAL)

The agent must adapt behavior based on the task type:

### EXECUTION MODE (default)
Used when implementing or modifying code.

- Apply all rules strictly
- Be surgical and minimal
- Do not explore beyond scope
- Do not refactor unless asked

---

### ANALYSIS MODE
Used when diagnosing, auditing, or explaining.

- You may explore multiple files and systems
- You may form hypotheses (clearly labeled)
- You may point out inconsistencies or risks
- You may suggest improvements (do NOT implement them)
- Do NOT modify code

---

### DESIGN MODE
Used when proposing new features or architecture.

- Think broadly and systemically
- Compare alternatives
- Highlight trade-offs
- Align with existing architecture
- Do NOT implement unless explicitly asked