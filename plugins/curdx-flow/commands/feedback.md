---
description: Submit feedback or report an issue for curdx-flow plugin.
arguments:
  - name: message
    description: Your feedback or issue description
    required: false
---

<example>
user: /curdx-flow:feedback The task verification system sometimes misses TASK_COMPLETE markers
assistant: I'll create a GitHub issue for that feedback.
</example>

<example>
user: /curdx-flow:feedback Feature request: add support for parallel task execution
assistant: I'll submit that feature request as a GitHub issue.
</example>

# Submit Feedback

Help improve curdx-flow by submitting feedback or reporting issues.

## Instructions

1. **Check if `gh` CLI is available** by running: `which gh`

2. **If `gh` is available**, create an issue with the user's feedback:
   ```bash
   gh issue create --repo curdx/curdx-flow --title "<short title from feedback>" --body "<full feedback message>"
   ```
   - Extract a short, descriptive title from the feedback
   - Include the full feedback in the body
   - Add the label `feedback` if it exists

3. **If `gh` is NOT available**, inform the user:
   > The `gh` CLI is not installed or not authenticated. Please submit your feedback manually at:
   >
   > **https://github.com/curdx/curdx-flow/issues/new**
   >
   > Or browse existing issues: https://github.com/curdx/curdx-flow/issues?q=sort%3Aupdated-desc+is%3Aissue+is%3Aopen

4. **If no message was provided**, ask the user what feedback they'd like to submit.

## Example Usage

```
/curdx-flow:feedback The task verification system sometimes misses TASK_COMPLETE markers
/curdx-flow:feedback Feature request: add support for parallel task execution
/curdx-flow:feedback Bug: cancel command doesn't cleanup .curdx-state.json properly
```
