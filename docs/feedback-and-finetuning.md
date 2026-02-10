# Feedback Collection & Model Fine-Tuning Guide

## Overview

The thumbs up/down buttons now **collect real feedback** that's persisted to the database. This data can be used to:

1. **Fine-tune the model** to give better responses
2. **Analyze model performance** by subject
3. **Identify problem areas** where the model struggles
4. **Create training datasets** for model improvement

## What We Collect

Each feedback submission stores:
- **Subject**: Which subject the feedback is for (Math, Physics, etc.)
- **User Question**: The question that prompted the response
- **Assistant Message**: The full response that was rated
- **Rating**: -1 (dislike), 0 (neutral), 1 (like)
- **Message Index**: Position in the conversation
- **Timestamp**: When the feedback was given

## Database Schema

```sql
CREATE TABLE feedback (
    id SERIAL PRIMARY KEY,
    subject_id VARCHAR(64) NOT NULL,
    message_content TEXT NOT NULL,
    user_question TEXT,
    rating SMALLINT NOT NULL,  -- -1, 0, or 1
    message_index INTEGER,
    created_at TIMESTAMP NOT NULL
);

-- Indexes for fast querying
CREATE INDEX ix_feedback_subject_rating ON feedback (subject_id, rating);
CREATE INDEX ix_feedback_created ON feedback (created_at);
```

## API Endpoints

### Get Feedback Statistics
```bash
GET /api/feedback/stats?subject_id=Math

Response:
{
  "total_feedback": 150,
  "likes": 120,
  "dislikes": 30,
  "like_percentage": 80.0,
  "subject_id": "Math"
}
```

### Export Feedback for Analysis
```bash
GET /api/feedback/export?subject_id=Physics&limit=100

Response: [
  {
    "id": 42,
    "subject_id": "Physics",
    "user_question": "Explain Newton's third law",
    "assistant_message": "Newton's third law states...",
    "rating": 1,
    "rating_label": "like",
    "created_at": "2026-02-05T10:30:00Z"
  },
  ...
]
```

## Using Feedback for Model Improvement

### 1. Export High-Quality Examples (Liked Responses)
```python
import requests
import json

# Get all liked responses for training data
response = requests.get("http://localhost:8000/api/feedback/export?limit=1000")
feedback = response.json()

# Filter only liked responses (rating = 1)
good_examples = [f for f in feedback if f["rating"] == 1]

# Format for fine-tuning (OpenAI format)
training_data = []
for example in good_examples:
    training_data.append({
        "messages": [
            {"role": "user", "content": example["user_question"]},
            {"role": "assistant", "content": example["assistant_message"]}
        ]
    })

# Save as JSONL for fine-tuning
with open("training_data.jsonl", "w") as f:
    for item in training_data:
        f.write(json.dumps(item) + "\n")
```

### 2. Identify Problem Areas (Disliked Responses)
```python
# Get disliked responses to understand what needs improvement
disliked = [f for f in feedback if f["rating"] == -1]

# Analyze by subject
from collections import Counter
problem_subjects = Counter(f["subject_id"] for f in disliked)
print("Subjects with most dislikes:", problem_subjects.most_common(5))

# Review specific examples
for example in disliked[:10]:
    print(f"\nSubject: {example['subject_id']}")
    print(f"Question: {example['user_question']}")
    print(f"Response: {example['assistant_message'][:200]}...")
```

### 3. Fine-Tune Llama 3.2 with Feedback Data

#### Using Unsloth (Fast & Memory-Efficient)
```python
from unsloth import FastLanguageModel
import torch

# Load Llama 3.2 3B
model, tokenizer = FastLanguageModel.from_pretrained(
    model_name="unsloth/llama-3.2-3b-instruct-bnb-4bit",
    max_seq_length=2048,
    dtype=None,
    load_in_4bit=True,
)

# Prepare for training
model = FastLanguageModel.get_peft_model(
    model,
    r=16,  # LoRA rank
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
    lora_alpha=16,
    lora_dropout=0.05,
    bias="none",
)

# Load your training data
from datasets import load_dataset
dataset = load_dataset("json", data_files="training_data.jsonl", split="train")

# Train
from trl import SFTTrainer
from transformers import TrainingArguments

trainer = SFTTrainer(
    model=model,
    tokenizer=tokenizer,
    train_dataset=dataset,
    max_seq_length=2048,
    args=TrainingArguments(
        per_device_train_batch_size=2,
        gradient_accumulation_steps=4,
        warmup_steps=10,
        max_steps=100,
        learning_rate=2e-4,
        fp16=True,
        logging_steps=1,
        output_dir="outputs",
    ),
)

trainer.train()

# Save the fine-tuned model
model.save_pretrained("fine_tuned_llama_3.2_subjectchat")
```

### 4. A/B Testing
- Deploy the fine-tuned model alongside the original
- Randomly assign users to each version
- Compare feedback ratings between versions
- Keep the better-performing model

## Continuous Improvement Workflow

1. **Collect Feedback** (ongoing)
   - Users give thumbs up/down on responses
   - Data automatically stored in PostgreSQL

2. **Weekly Analysis** (automated)
   - Export feedback data
   - Calculate metrics (like rate, problem subjects)
   - Identify patterns in disliked responses

3. **Monthly Fine-Tuning** (when sufficient data)
   - Export 500+ liked examples
   - Fine-tune model on high-quality data
   - Test on validation set
   - Deploy if metrics improve

4. **Monitor Performance**
   - Track like percentage over time
   - Set target: >85% like rate
   - Alert if rate drops below threshold

## Analytics Dashboard (Future Enhancement)

Create a simple dashboard to visualize:
- Feedback trends over time
- Performance by subject
- Most common disliked topics
- Response quality metrics

Example query for daily stats:
```sql
SELECT 
    DATE(created_at) as date,
    subject_id,
    COUNT(*) as total,
    SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) as likes,
    ROUND(SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) as like_pct
FROM feedback
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at), subject_id
ORDER BY date DESC, subject_id;
```

## Privacy & Ethics

- **User Privacy**: No personal information is stored with feedback
- **Data Retention**: Consider GDPR-compliant retention policies
- **Bias Detection**: Monitor for subject or demographic bias in ratings
- **Quality Control**: Review disliked examples to ensure fair ratings

## Next Steps

1. ✅ Feedback collection implemented
2. ⏳ Set up automated weekly reports
3. ⏳ Collect baseline dataset (1000+ examples)
4. ⏳ First fine-tuning experiment
5. ⏳ Deploy improved model
6. ⏳ Build analytics dashboard

## Resources

- [Unsloth Fine-Tuning](https://github.com/unslothai/unsloth) - Fast LoRA training
- [Llama 3.2 Fine-Tuning Guide](https://huggingface.co/docs/transformers/main/model_doc/llama)
- [OpenAI Fine-Tuning Format](https://platform.openai.com/docs/guides/fine-tuning)
- [TRL (Transformer Reinforcement Learning)](https://github.com/huggingface/trl)
