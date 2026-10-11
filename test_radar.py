import requests
import feedparser
headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
rss_url = 'https://news.google.com/rss/search?q=economy+global+markets+finance&hl=en-US&gl=US&ceid=US:en'
r = requests.get(rss_url, headers=headers, timeout=10)
feed = feedparser.parse(r.content)
print(f"News found: {len(feed.entries)}")
if len(feed.entries) > 0:
    print(feed.entries[0].title)
