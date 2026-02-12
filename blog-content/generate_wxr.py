#!/usr/bin/env python3
"""
Generate a WordPress WXR (WordPress eXtended RSS) import file
from the 15 blog post HTML files in the blog-content directory.
"""

import os
import re
import json
from html.parser import HTMLParser

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Ordered list of files to process
FILES = [
    "post-01-losing-money-printing-in-house.html",
    "post-02-how-to-price-vehicle-wraps.html",
    "post-03-fleet-wraps-profit-guide.html",
    "post-04-stop-buying-equipment.html",
    "post-05-five-twenty-seven-revolution.html",
    "post-06-wall-wraps-revenue-stream.html",
    "post-07-start-wrap-business-under-5k.html",
    "post-08-add-wrap-services-no-overhead.html",
    "post-09-commercial-wraps-opportunity.html",
    "post-10-window-perf-upsell.html",
    "post-11-fast-turnaround.html",
    "post-12-scale-fifty-jobs-month.html",
    "post-13-3m-vs-avery-comparison.html",
    "post-14-file-prep-guide.html",
    "post-15-weekly-playbook-50k-month.html",
]

# Category assignments
CATEGORY_MAP = {
    1: ("money-margins", "Money & Margins"),
    2: ("money-margins", "Money & Margins"),
    3: ("money-margins", "Money & Margins"),
    4: ("money-margins", "Money & Margins"),
    5: ("money-margins", "Money & Margins"),
    6: ("growth-revenue", "Growth & Revenue"),
    7: ("growth-revenue", "Growth & Revenue"),
    8: ("growth-revenue", "Growth & Revenue"),
    9: ("growth-revenue", "Growth & Revenue"),
    10: ("growth-revenue", "Growth & Revenue"),
    11: ("operations-scale", "Operations & Scale"),
    12: ("operations-scale", "Operations & Scale"),
    13: ("operations-scale", "Operations & Scale"),
    14: ("operations-scale", "Operations & Scale"),
    15: ("operations-scale", "Operations & Scale"),
}


def extract_post_number(filename):
    """Extract the post number from the filename, e.g. post-01-... -> 1"""
    match = re.match(r'post-(\d+)-', filename)
    if match:
        return int(match.group(1))
    return 0


def generate_slug(filename):
    """Generate slug from filename: remove 'post-NN-' prefix and '.html' suffix."""
    # Remove .html
    name = filename.replace('.html', '')
    # Remove 'post-NN-' prefix
    name = re.sub(r'^post-\d+-', '', name)
    return name


def extract_title(html):
    """Extract the <title> tag content, stripping ' | WePrintWraps' suffix."""
    match = re.search(r'<title>(.*?)</title>', html, re.DOTALL)
    if match:
        title = match.group(1).strip()
        # Remove the suffix if present
        title = re.sub(r'\s*\|\s*WePrintWraps\s*$', '', title)
        return title
    return ""


def extract_meta_description(html):
    """Extract the meta description content."""
    match = re.search(r'<meta\s+name="description"\s+content="(.*?)"', html, re.DOTALL)
    if match:
        return match.group(1).strip()
    return ""


def extract_style_block(html):
    """Extract the <style> block from the <head> section."""
    # Get the head section first
    head_match = re.search(r'<head>(.*?)</head>', html, re.DOTALL)
    if head_match:
        head_content = head_match.group(1)
        # Find the style block within head
        style_match = re.search(r'<style>(.*?)</style>', head_content, re.DOTALL)
        if style_match:
            return '<style>' + style_match.group(1) + '</style>'
    return ""


def extract_article_content(html):
    """Extract the inner HTML of the <article> tag (or <body> if no article)."""
    # Try article first
    article_match = re.search(r'<article[^>]*>(.*?)</article>', html, re.DOTALL)
    if article_match:
        return article_match.group(1).strip()
    # Fallback to body
    body_match = re.search(r'<body[^>]*>(.*?)</body>', html, re.DOTALL)
    if body_match:
        content = body_match.group(1).strip()
        # Remove any script tags from body content
        content = re.sub(r'<script[^>]*>.*?</script>', '', content, flags=re.DOTALL)
        return content
    return ""


def extract_faq_schema(html):
    """Extract FAQ schema script blocks (those containing FAQPage)."""
    scripts = re.findall(r'<script\s+type="application/ld\+json">(.*?)</script>', html, re.DOTALL)
    faq_scripts = []
    for script_content in scripts:
        try:
            data = json.loads(script_content)
            if data.get("@type") == "FAQPage":
                faq_scripts.append('<script type="application/ld+json">' + script_content + '</script>')
        except (json.JSONDecodeError, AttributeError):
            # Check as string if JSON parsing fails
            if "FAQPage" in script_content:
                faq_scripts.append('<script type="application/ld+json">' + script_content + '</script>')
    return "\n".join(faq_scripts)


def escape_cdata(text):
    """Escape any occurrences of ]]> in the text so CDATA doesn't break."""
    return text.replace(']]>', ']]]]><![CDATA[>')


def build_item_xml(title, slug, description, content, cat_slug, cat_name):
    """Build a single <item> XML block."""
    escaped_content = escape_cdata(content)
    escaped_description = escape_cdata(description)

    return f"""    <item>
        <title>{title}</title>
        <link>https://weprintwraps.com/blog/{slug}</link>
        <dc:creator><![CDATA[admin]]></dc:creator>
        <description>{description}</description>
        <content:encoded><![CDATA[
{escaped_content}
        ]]></content:encoded>
        <excerpt:encoded><![CDATA[{escaped_description}]]></excerpt:encoded>
        <wp:post_id>0</wp:post_id>
        <wp:post_date>2026-02-12 00:00:00</wp:post_date>
        <wp:post_date_gmt>2026-02-12 00:00:00</wp:post_date_gmt>
        <wp:post_modified>2026-02-12 00:00:00</wp:post_modified>
        <wp:post_modified_gmt>2026-02-12 00:00:00</wp:post_modified_gmt>
        <wp:comment_status>open</wp:comment_status>
        <wp:ping_status>open</wp:ping_status>
        <wp:post_name>{slug}</wp:post_name>
        <wp:status>draft</wp:status>
        <wp:post_parent>0</wp:post_parent>
        <wp:menu_order>0</wp:menu_order>
        <wp:post_type>post</wp:post_type>
        <wp:post_password></wp:post_password>
        <wp:is_sticky>0</wp:is_sticky>
        <category domain="category" nicename="{cat_slug}"><![CDATA[{cat_name}]]></category>
    </item>"""


def build_wxr(items_xml):
    """Build the complete WXR XML document."""
    return f"""<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0"
    xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/"
    xmlns:content="http://purl.org/rss/1.0/modules/content/"
    xmlns:wfw="http://wellformedweb.org/CommentAPI/"
    xmlns:dc="http://purl.org/dc/elements/1.1/"
    xmlns:wp="http://wordpress.org/export/1.2/"
>
<channel>
    <title>WePrintWraps Blog Import</title>
    <link>https://weprintwraps.com</link>
    <description>Blog posts for WePrintWraps.com</description>
    <language>en-US</language>
    <wp:wxr_version>1.2</wp:wxr_version>
    <wp:base_site_url>https://weprintwraps.com</wp:base_site_url>
    <wp:base_blog_url>https://weprintwraps.com</wp:base_blog_url>

    <!-- Categories -->
    <wp:category>
        <wp:term_id>0</wp:term_id>
        <wp:category_nicename>money-margins</wp:category_nicename>
        <wp:category_parent></wp:category_parent>
        <wp:cat_name><![CDATA[Money & Margins]]></wp:cat_name>
    </wp:category>
    <wp:category>
        <wp:term_id>0</wp:term_id>
        <wp:category_nicename>growth-revenue</wp:category_nicename>
        <wp:category_parent></wp:category_parent>
        <wp:cat_name><![CDATA[Growth & Revenue]]></wp:cat_name>
    </wp:category>
    <wp:category>
        <wp:term_id>0</wp:term_id>
        <wp:category_nicename>operations-scale</wp:category_nicename>
        <wp:category_parent></wp:category_parent>
        <wp:cat_name><![CDATA[Operations & Scale]]></wp:cat_name>
    </wp:category>

{items_xml}

</channel>
</rss>
"""


def count_words(text):
    """Count words in HTML content (strip tags first)."""
    # Remove HTML tags
    clean = re.sub(r'<[^>]+>', ' ', text)
    # Remove extra whitespace
    clean = re.sub(r'\s+', ' ', clean).strip()
    return len(clean.split())


def main():
    items = []
    print("Processing blog posts...\n")
    print(f"{'#':<4} {'Title':<65} {'Words':<8} {'Category'}")
    print("-" * 110)

    for filename in FILES:
        filepath = os.path.join(BASE_DIR, filename)
        post_num = extract_post_number(filename)
        slug = generate_slug(filename)
        cat_slug, cat_name = CATEGORY_MAP[post_num]

        with open(filepath, 'r', encoding='utf-8') as f:
            html = f.read()

        title = extract_title(html)
        description = extract_meta_description(html)
        style_block = extract_style_block(html)
        article_content = extract_article_content(html)
        faq_schema = extract_faq_schema(html)

        # Combine: style block + article content + FAQ schema
        full_content_parts = []
        if style_block:
            full_content_parts.append(style_block)
        if article_content:
            full_content_parts.append(article_content)
        if faq_schema:
            full_content_parts.append(faq_schema)

        full_content = "\n\n".join(full_content_parts)

        word_count = count_words(full_content)

        item_xml = build_item_xml(title, slug, description, full_content, cat_slug, cat_name)
        items.append(item_xml)

        # Truncate title for display
        display_title = title[:63] + ".." if len(title) > 65 else title
        print(f"{post_num:<4} {display_title:<65} {word_count:<8} {cat_name}")

    # Combine all items
    all_items_xml = "\n\n".join(items)

    # Build the full WXR document
    wxr_xml = build_wxr(all_items_xml)

    # Write to file
    output_path = os.path.join(BASE_DIR, "wpw-blog-import.xml")
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(wxr_xml)

    # Verification
    print("\n" + "=" * 110)
    print("VERIFICATION")
    print("=" * 110)

    # Count items
    item_count = wxr_xml.count('<item>')
    print(f"\nTotal <item> elements: {item_count}")

    # Check each item has content
    empty_items = []
    for i, item in enumerate(items):
        # Check if content:encoded has actual content between CDATA tags
        content_match = re.search(r'<content:encoded><!\[CDATA\[(.*?)\]\]></content:encoded>', item, re.DOTALL)
        if content_match:
            content = content_match.group(1).strip()
            if not content:
                empty_items.append(i + 1)

    if empty_items:
        print(f"WARNING: Posts with empty content: {empty_items}")
    else:
        print("All 15 posts have non-empty content.")

    # File size
    file_size = os.path.getsize(output_path)
    print(f"\nOutput file: {output_path}")
    print(f"File size: {file_size:,} bytes ({file_size / 1024:.1f} KB)")

    # Check post statuses
    draft_count = wxr_xml.count('<wp:status>draft</wp:status>')
    print(f"Posts with draft status: {draft_count}")

    print(f"\nDone! WXR file generated successfully with {item_count} posts.")


if __name__ == "__main__":
    main()
