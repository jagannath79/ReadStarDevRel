import { NextResponse } from 'next/server';

interface RegistrationRequest {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  grade: number;
}

function buildEmailPayload(data: RegistrationRequest) {
  const registeredAt = new Date().toLocaleString('en-US', {
    dateStyle: 'full',
    timeStyle: 'short',
  });

  return {
    subject: 'Welcome to ReadStar! Your student account is ready 🎉',
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;max-width:640px;margin:auto;">
        <h2 style="color:#1B3A8C;margin-bottom:8px;">Welcome to ReadStar, ${data.firstName}!</h2>
        <p style="margin-top:0;">Your student account has been successfully created.</p>
        <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:16px;margin:20px 0;">
          <p style="margin:0 0 8px;"><strong>Name:</strong> ${data.firstName} ${data.lastName}</p>
          <p style="margin:0 0 8px;"><strong>Username:</strong> ${data.username}</p>
          <p style="margin:0 0 8px;"><strong>Email:</strong> ${data.email}</p>
          <p style="margin:0 0 8px;"><strong>Grade:</strong> ${data.grade}</p>
          <p style="margin:0;"><strong>Registered:</strong> ${registeredAt}</p>
        </div>
        <p>You can now sign in and start your reading journey.</p>
        <p style="margin-top:20px;">— The ReadStar Team</p>
      </div>
    `,
    text: [
      `Welcome to ReadStar, ${data.firstName}!`,
      'Your student account has been successfully created.',
      '',
      `Name: ${data.firstName} ${data.lastName}`,
      `Username: ${data.username}`,
      `Email: ${data.email}`,
      `Grade: ${data.grade}`,
      `Registered: ${registeredAt}`,
      '',
      'You can now sign in and start your reading journey.',
      '— The ReadStar Team',
    ].join('\n'),
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RegistrationRequest;

    if (!body?.email || !body?.firstName || !body?.lastName || !body?.username || !body?.grade) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    const senderEmail = process.env.RESEND_FROM_EMAIL;

    if (!resendApiKey || !senderEmail) {
      return NextResponse.json(
        { error: 'Email service is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL.' },
        { status: 503 }
      );
    }

    const emailContent = buildEmailPayload(body);

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: senderEmail,
        to: [body.email],
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Resend API error:', errorText);
      return NextResponse.json({ error: 'Failed to send registration email.' }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Failed to send registration email:', error);
    return NextResponse.json({ error: 'Failed to send registration email.' }, { status: 500 });
  }
}
