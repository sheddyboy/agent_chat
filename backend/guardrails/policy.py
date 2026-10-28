"""The guards as plain data: swap a model or threshold here, nowhere else.

Each guard is a Hugging Face text classifier. `flag` lists the labels that count as a hit
(names come from the model's id2label), and the guard fires when the top of those scores
reaches `threshold`. `action` is "block" (refuse the turn) or "warn" (answer, but record it).
"""

GUARDS = {
    "injection": {
        "model": "protectai/deberta-v3-base-prompt-injection-v2",
        "flag": ["INJECTION"],
        # Benign text with words like "ignore" can score around 0.88
        "threshold": 0.9,
        "action": "block",
    },
    "hate": {
        # Attacks on groups; toxic-bert's identity_hate gave a plain slur only 0.38
        "model": "facebook/roberta-hate-speech-dynabench-r4-target",
        "flag": ["hate"],
        "threshold": 0.9,
        "action": "block",
    },
    "threat": {
        # Real threats scored about 0.76, "kill this bug" 0.55: a narrow margin
        "model": "unitary/toxic-bert",
        "flag": ["threat"],
        "threshold": 0.7,
        "action": "block",
    },
    "toxicity": {
        # Not the catch-all "toxic" label: venting like "this damn bug" scores 0.87 on it
        "model": "unitary/toxic-bert",
        "flag": ["insult", "severe_toxic", "identity_hate"],
        "threshold": 0.7,
        "action": "warn",
    },
}

# Guards run on each user message, in order
INPUT = ["injection", "hate", "threat", "toxicity"]
