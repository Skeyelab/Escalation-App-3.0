# Escalation App

Will help you escalate tickets from predefined rules.

## Configuration

Here's an example of a configuration template:

```json
[
  {
    "escalation_reason": "esc_ci1",
    "attributes": {
      "submitter_id": 410989,
      "group_id": 424242,
      "subject": "My printer is on fire!",
      "comment": {
        "body": "The smoke is very colorful."
      },
      "tags": ["tag1", "tag1"],
      "custom_fields": [
        { "id": 123456, "value": "{{ticket.custom_field_123456}}" }
      ]
    }
  },
  {
    "escalation_reason": "esc_pi1",
    "attributes": {
      "submitter_id": 410989,
      "group_id": 424242,
      "subject": "Please, look into this",
      "comment": {
        "body": "The customer is angry..."
      }
    }
  }
]
```
