import app from '../hono/hono';

function assertAdmin(c) {
	const adminAuth = c.req.header('x-admin-auth') || '';
	if (!adminAuth || adminAuth !== c.env.jwt_secret) {
		return c.json({ error: 'unauthorized' }, 401);
	}
	return null;
}

function toInt(value, fallback, max) {
	const parsed = Number.parseInt(value || '', 10);
	if (!Number.isFinite(parsed) || parsed < 0) return fallback;
	return Math.min(parsed, max);
}

function toRaw(row) {
	const subject = row.subject || '';
	const text = row.text || '';
	const html = row.content || '';
	const from = row.send_email || '';
	const to = row.to_email || '';
	return [
		`From: ${from}`,
		`To: ${to}`,
		`Subject: ${subject}`,
		'',
		text,
		html
	].filter(item => item !== null && item !== undefined).join('\n');
}

app.get('/admin/mails', async (c) => {
	const unauthorized = assertAdmin(c);
	if (unauthorized) return unauthorized;

	const limit = toInt(c.req.query('limit'), 20, 100);
	const offset = toInt(c.req.query('offset'), 0, 10000);
	const address = (c.req.query('address') || '').trim().toLowerCase();

	let sql = `
		SELECT email_id, send_email, to_email, subject, text, content, create_time
		FROM email
		WHERE is_del = 0 AND type = 0
	`;
	const args = [];

	if (address) {
		sql += ' AND lower(to_email) = ?';
		args.push(address);
	}

	sql += ' ORDER BY email_id DESC LIMIT ? OFFSET ?';
	args.push(limit, offset);

	const { results } = await c.env.db.prepare(sql).bind(...args).all();
	const mails = (results || []).map(row => ({
		id: row.email_id,
		from: row.send_email,
		to: row.to_email,
		subject: row.subject || '',
		raw: toRaw(row),
		created_at: row.create_time
	}));

	return c.json({ results: mails });
});

app.delete('/admin/mails/:id', async (c) => {
	const unauthorized = assertAdmin(c);
	if (unauthorized) return unauthorized;

	const id = Number.parseInt(c.req.param('id') || '', 10);
	if (!Number.isFinite(id) || id <= 0) {
		return c.json({ error: 'invalid id' }, 400);
	}

	await c.env.db.prepare('UPDATE email SET is_del = 1 WHERE email_id = ?').bind(id).run();
	return c.json({ ok: true });
});
