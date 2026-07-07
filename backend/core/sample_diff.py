"""A hardcoded sample diff used by the /demo endpoint and tests.

It intentionally contains a SQL injection, a hardcoded secret, an N+1 query,
and a missing docstring so every agent has something to find.
"""

SAMPLE_DIFF = '''\
diff --git a/app/db.py b/app/db.py
index 1a2b3c4..5d6e7f8 100644
--- a/app/db.py
+++ b/app/db.py
@@ -10,6 +10,18 @@ import sqlite3
+
+API_KEY = "sk-live-9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c"
+
+def get_user(conn, user_id):
+    cursor = conn.cursor()
+    query = "SELECT * FROM users WHERE id = '" + user_id + "'"
+    cursor.execute(query)
+    return cursor.fetchone()
+
+def get_orders_for_users(conn, users):
+    results = []
+    for user in users:
+        cur = conn.cursor()
+        cur.execute("SELECT * FROM orders WHERE user_id = %s" % user["id"])
+        results.append(cur.fetchall())
+    return results
diff --git a/app/views.py b/app/views.py
index 2b3c4d5..6e7f8a9 100644
--- a/app/views.py
+++ b/app/views.py
@@ -5,3 +5,9 @@ from app.db import get_user
+
+def render_profile(request):
+    name = request.GET.get("name")
+    html = "<div>Welcome " + name + "</div>"
+    return HttpResponse(html)
'''
