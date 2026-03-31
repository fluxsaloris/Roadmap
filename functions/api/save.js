export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const email = request.headers.get("cf-access-authenticated-user-email");

    if (!email) {
      return new Response("Not logged in via Cloudflare Access", { status: 401 });
    }

    if (email.toLowerCase() !== env.ALLOWED_EMAIL.toLowerCase()) {
      return new Response("Unauthorized: " + email, { status: 403 });
    }

    const body = await request.json();
    const data = body.data;

    const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${env.GITHUB_FILE_PATH}`;

    // Get current file
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json"
      }
    });

    const file = await res.json();

    const content = btoa(JSON.stringify(data, null, 2));

    // Update file
    const update = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: "Update roadmap",
        content,
        sha: file.sha
      })
    });

    if (!update.ok) {
      const txt = await update.text();
      return new Response("GitHub error: " + txt, { status: 500 });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response("Server error: " + err.message, { status: 500 });
  }
}
