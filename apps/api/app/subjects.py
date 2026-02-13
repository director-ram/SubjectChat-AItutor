from __future__ import annotations

from typing import Dict

from .schemas import CustomSubjectConfig


def get_default_subjects() -> Dict[str, dict]:
    """
    In a real system this would likely be loaded from JSON files under subjects/*.json.
    For the initial implementation, keep them in code so the API is usable immediately.
    """

    return {
        "math": {
            "id": "math",
            "name": "Math",
            "description": "Step-by-step explanations, worked examples, and practice problems for mathematics.",
            "teaching_style": (
                "Explain concepts step by step, show intermediate steps, and ask the learner to attempt parts "
                "of the solution before revealing everything."
            ),
        },
        "physics": {
            "id": "physics",
            "name": "Physics",
            "description": "Intuitive explanations of physical concepts with equations and real-world examples.",
            "teaching_style": (
                "Relate formulas to physical intuition, use diagrams conceptually, and check the learner's "
                "understanding with simple thought experiments."
            ),
        },
        "chemistry": {
            "id": "chemistry",
            "name": "Chemistry",
            "description": "Help with chemical reactions, stoichiometry, and conceptual understanding.",
            "teaching_style": "Use clear notation, explain each reaction step, and highlight safety-relevant facts.",
        },
        "history": {
            "id": "history",
            "name": "History",
            "description": "Contextual narratives of historical events with attention to sources and bias.",
            "teaching_style": (
                "Provide timelines, causes and effects, and multiple viewpoints; encourage critical thinking "
                "about sources."
            ),
        },
        "writing": {
            "id": "writing",
            "name": "English / Writing",
            "description": "Guidance on structure, clarity, and style for essays and other writing tasks.",
            "teaching_style": (
                "Focus on structure, clarity, and revision. Ask clarifying questions before rewriting large "
                "sections; avoid doing full exam essays for the learner."
            ),
        },
    }


def build_subject_system_prompt(
    subject_id: str | None,
    custom_subject: CustomSubjectConfig | None,
) -> str:
    """
    Build a system prompt string that conditions the tutor on either a default or custom subject.
    """

    base_prompt = (
        "You are SubjectChat, a helpful AI tutor for students. "
        "You explain concepts clearly, encourage understanding over rote answers, and adapt to the user's level. "
        "Prefer hints and guided reasoning before giving final answers."
    )

    if custom_subject is not None:
        parts = [
            base_prompt,
            f"The learner has defined a custom subject called '{custom_subject.name}'.",
        ]
        if custom_subject.description:
            parts.append(f"Subject description: {custom_subject.description}")
        if custom_subject.teaching_style:
            parts.append(f"Teaching style: {custom_subject.teaching_style}")
        else:
            parts.append(
                "Use examples, ask occasional comprehension questions, and be encouraging and concise.",
            )
        return "\n\n".join(parts)

    subjects = get_default_subjects()
    subject = subjects.get(subject_id or "")

    if not subject:
        # Fallback: generic tutor if subject is missing or unknown.
        return base_prompt

    return "\n\n".join(
        [
            base_prompt,
            f"You are currently teaching the subject: {subject['name']}.",
            f"Subject description: {subject['description']}",
            f"Teaching style: {subject['teaching_style']}",
        ]
    )

