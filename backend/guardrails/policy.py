"""The guards as plain data: swap a model or threshold here, nowhere else.

Each guard is a Hugging Face text classifier. `flag` lists the labels that count as a hit
(names come from the model's id2label), and the guard fires when the top of those scores
reaches `threshold`.
"""

GUARDS = {
    "injection": {
        "model": "protectai/deberta-v3-base-prompt-injection-v2",
        "flag": ["INJECTION"],
        # Benign text with words like "ignore" can score around 0.88
        "threshold": 0.9,
        "action": "block",
    },
}

# Guards run on each user message, in order
INPUT = ["injection"]
