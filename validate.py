import re

with open('dashboard.js', 'r', encoding='utf-8') as f:
    code = f.read()

# remove comments
code_clean = re.sub(r'//.*', '', code)
code_clean = re.sub(r'/\*.*?\*/', '', code_clean, flags=re.DOTALL)
# remove template strings
code_clean = re.sub(r'`(?:\\.|[^`\\])*`', '""', code_clean)
# remove single and double quoted strings
code_clean = re.sub(r'"(?:\\.|[^"\\])*"', '""', code_clean)
code_clean = re.sub(r"'(?:\\.|[^'\\])*'", "''", code_clean)

p, b, k = 0, 0, 0
for i, ch in enumerate(code_clean):
    if ch == '(': p += 1
    elif ch == ')': p -= 1
    elif ch == '{': b += 1
    elif ch == '}': b -= 1
    elif ch == '[': k += 1
    elif ch == ']': k -= 1
    if p < 0 or b < 0 or k < 0:
        print(f"Negative count at {i}: ch={ch}, p={p}, b={b}, k={k}")
        print("Context:", code_clean[max(0, i-50):min(len(code_clean), i+50)])
        break

print(f"Result -> Parens: {p}, Braces: {b}, Brackets: {k}")
