import json

with open("data/stats_female_new.json", encoding="utf-8") as f:
    s = json.load(f)
print("stats_female_new.json:")
print(f"  categories: {len(s['category_reads'])}, top_books: {len(s['top_books'])}")
for c in s["category_reads"][:3]:
    print(f"    {c['category']}: {c['reads_str']}")
print()

with open("data/market_summary_female_new.json", encoding="utf-8") as f:
    m = json.load(f)
print("market_summary_female_new.json:")
print(f"  periods: {list(m['periods'].keys())}")
print(f"  hot_genres (7d): {[g['name'] for g in m['periods']['7']['hot_genres'][:3]]}")
print(f"  hot_types (7d): {[t['name'] for t in m['periods']['7']['hot_types'][:3]]}")
print()

with open("data/dates.json", encoding="utf-8") as f:
    d = json.load(f)
print("dates.json:")
print(f"  dates count: {len(d['dates'])}")
print(f"  lists keys: {list(d['lists'].keys())}")
print(f"  female_new latest: {d['lists']['female_new']['latest_date']}")
print()

# Check API structure
import os
api_files = []
for root, dirs, files in os.walk("api/lastest/female_new"):
    for fn in files:
        api_files.append(os.path.join(root, fn).replace("\\", "/"))
print(f"api/lastest/female_new/: {len(api_files)} files")
for f in sorted(api_files)[:5]:
    print(f"  {f}")
print()

# Check latest_female_new.json
with open("data/latest_female_new.json", encoding="utf-8") as f:
    lf = json.load(f)
print("latest_female_new.json:")
print(f"  date: {lf['date']}, prev_date: {lf['prev_date']}")
print(f"  categories: {len(lf['categories'])}")
if lf['categories']:
    cat = lf['categories'][0]
    print(f"  first category: {cat['name']}, books: {len(cat.get('books', []))}")
    trend = cat.get('trend', {})
    print(f"    new_count: {trend.get('new_count')}, summary: {trend.get('summary', '')[:60]}")
