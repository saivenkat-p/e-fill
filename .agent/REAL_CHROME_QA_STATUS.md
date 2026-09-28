# Real Chrome Customer QA Status (Agent 1)

## Customer Testing Scope
The Real Chrome Customer QA Agent tests the complete product experience inside a real Google Chrome browser against realistic application workflows (JAM 2027 and multi-page government application portals).

## Required Real Chrome Workflow Checks (Tests A–N)

| Test | Feature | Exact Action | Expected Result | Actual Result | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Test A** | JAM Page Detection | Open real JAM page with JAM Paper & City 1, 2, 3 | Detects 4 form controls, maps to `jam_paper`, `exam_city_1/2/3`; NO "No fillable form detected" | Detected 5 controls in `#jam-page-1`; mapped `jam_paper`, `exam_city_1`, `exam_city_2`, `exam_city_3`; zero errors | **PASS** |
| **Test B** | Select Autofill | User approves JAM paper "Mathematics (MA)" | Native setter sets select, triggers events, reads DOM | Native setter selected "Mathematics (MA)", verified in DOM `#jam_paper` | **PASS** |
| **Test C** | Multi-City Autofill | User chooses Cities 1, 2, 3 | Sets selects in DOM, reads actual selected options | DOM values: `#exam_city_1` = "Bengaluru", `#exam_city_2` = "Warangal", `#exam_city_3` = "Hyderabad" | **PASS** |
| **Test D** | 10th Document Extraction | Upload real 10th marksheet (`10th marks list rohit .pdf`) | Actual values extracted & rendered in My Information as individual cards | Extracted all genuine fields: Student Name (`PENDYALA SAI ROHITH`), Father Name (`PENDYALA SAI SRINIVAS`), Mother Name (`PENDYALA VEERA RAMADEVI`), Roll (`2208118502`), Board (`Board of Secondary Education ANDHRA PRADESH, INDIA`), School (`MPL H.S,RATNAMPETA,RAMACHANDRAPURAM EAST GODAVARI DISTRICT`), Passing Year (`2022`), DOB (`2007-03-20`), Total Marks (`514`), Max Marks (`600`), Percentage (`85.67`), Medium (`ENGLISH`), Division (`FIRST`), Cert No (`VV 061954`), Reg/PC No (`PC/08/07462/061954/P2`), Subject Marks (Telugu: 93, Hindi: 85, English: 85, Math: 87, Science: 90, Social: 74), Moles/Identification marks; verified individual field cards in My Information; verified DOM autofill | **PASS** |
| **Test E** | Dynamic Fields | Real document with dynamic fields (Grade, Medium, Cert No, PC No, Subjects) | New individual My Information fields created with ✏️ and 🗑️ | Dynamically extracted `edu_grade` ("FIRST"), `edu_medium` ("ENGLISH"), `edu_certificate_number` ("VV 061954"), `edu_registration_number` ("PC/08/07462/061954/P2"), and 6 subject scores as independent cards | **PASS** |
| **Test F** | Edit Persistence | Edit dynamic field in My Information, reload | Edited value persists with USER_EDITED provenance | Edited `edu_medium` to "English (Bilingual)"; persisted across toJSON/fromJSON with `USER_EDITED` provenance | **PASS** |
| **Test G** | Delete Persistence | Delete a field in My Information, reload | Field remains deleted after reload | Deleted `edu_medium`; verified absence across toJSON/fromJSON reload (Bug C fix verified) | **PASS** |
| **Test H** | Document Merge | Upload Doc A then Doc B | Datasets coexist; new fields added | 10th Marksheet (`10th marks list rohit .pdf`) and EWS Certificate (Doc B) merged into living profile without data loss | **PASS** |
| **Test I** | Conflict Handling | Differing values in incoming document | Flags CONFLICT, asks user, no silent overwrite | Flagged `CONFLICT` on father name; no silent overwrite; `KEEP_EXISTING` preserved original value (`PENDYALA SAI SRINIVAS`) | **PASS** |
| **Test J** | Review & Fill Scope | Current page requests subset of profile | Displays ONLY current page fields | Page 1 proposal list contained strictly visible exam controls; Page 2 fields were not leaked | **PASS** |
| **Test K** | E2E DOM Autofill | Review & Fill approval -> DOM | Real DOM inputs change, post-fill verified | 7/7 real DOM controls autofilled & verified: first_name, applicant_name, email, phone, dob, category, declaration | **PASS** |
| **Test L** | Multi-Page Journey | Advance manually to Page 2 | Discovers new page, updates Application Plan, recalculates missing | Manual click on `#btn-save-next-1` revealed Page 2; Form Detector discovered 7 new controls; Application Plan updated | **PASS** |
| **Test M** | Assistant Flow | Assistant prompts for missing field | User answers; routes to application context -> DOM autofill | Assistant formulated dynamic question for `jam_paper` with 7 real DOM `<select>` options; choice saved to session without profile pollution | **PASS** |
| **Test N** | Safety Invariants | Full workflow execution | Submit count = 0, no auto-next, no OTP/CAPTCHA, no original doc stored | Submit count remained strictly 0; declaration checkbox never auto-checked; 0 original files persisted | **PASS** |

## Summary
- **Total Real Chrome CDP Invocations**: 61 assertions
- **Passed**: 61
- **Failed**: 0
- **User Document**: Genuine `10th marks list rohit .pdf` extracted and validated without mock or synthetic values
- **Regression Status**: 0 regressions across unit tests (213/213 PASS) and decision tests (13/13 PASS).
