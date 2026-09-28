# Architecture & Safety Status (Agent 3)

## Architectural Boundaries & Principles

### 1. Absolute Four-Way Separation
- **My Information**: The complete, living, user-controlled information store. Contains everything E-Fill knows about the selected person. Grows over time.
- **Application Plan**: What the current application requires / may require. Tracks discovered pages, discovered sections, detected fields, requirements vs. My Information (available, missing, conflicts), pending user questions, and document requirements.
- **Review & Fill**: ONLY the current page's actionable fields. Never displays the entire My Information database.
- **Assistant**: Conversational interface for gathering missing or ambiguous information. Driven by Application Plan + My Information. Does NOT act as an independent source of truth.

### 2. Dynamic Information & Document Rules
- **No Monolithic Multi-Input Forms**: Education records and dynamically extracted fields must use individual `profile-field-item` cards with their own `✏️` edit and `🗑️` delete buttons.
- **Document A/B/C Rules**:
  - Document A: Populates all present missing fields.
  - Document B: Populates present fields (e.g. Board); does NOT fabricate missing fields (e.g. Year).
  - Document C: Merges existing fields; creates new individual fields for new data (Certificate Number, Registration Number, Grade, Medium, etc.).
- **Unrestricted Extraction**: Active application missing fields must NEVER restrict document extraction. The whole document is always processed.

### 3. Safety & Privacy Invariants
- **Zero Auto-Submit**: Form submit attempts must remain strictly `0`. Submit buttons are never programmatically clicked.
- **No Automatic Next**: Page progression is manual; the user navigates to subsequent steps.
- **No CAPTCHA / OTP Bypass**: Strictly prohibited.
- **No Automatic Legal Acceptance**: Checkboxes declaring statements or legal commitments are never bulk auto-checked.
- **No Original Document Persistence**: Original document images or PDF binary blobs are never stored; only structured canonical/custom data with provenance is retained.
- **Profile Isolation**: Multiple person profiles (e.g. Sai vs. Brother) remain strictly isolated; one person's document never overwrites another.
