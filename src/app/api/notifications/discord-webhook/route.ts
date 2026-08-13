import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      userName,
      userPhoto,
      type,
      workMode,
      location,
      timeStr,
      dateStr,
      webhookUrl: providedWebhookUrl,
      isTest
    } = body;

    const webhookUrl =
      providedWebhookUrl ||
      process.env.DISCORD_WEBHOOK_URL ||
      process.env.NEXT_PUBLIC_DISCORD_WEBHOOK_URL;

    if (!webhookUrl || typeof webhookUrl !== 'string' || !webhookUrl.startsWith('http')) {
      return NextResponse.json(
        { success: false, message: 'No valid Discord Webhook URL configured' },
        { status: 400 }
      );
    }

    // Handle Discord Webhook Test Request
    if (isTest) {
      const testPayload = {
        username: 'Print Mart Assistant',
        avatar_url: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
        embeds: [
          {
            title: '🔔 Discord Webhook Connected!',
            description: 'Print Mart Assistant has successfully connected to this Discord channel! Live employee punch-in and punch-out notifications will be dispatched here.',
            color: 3447003, // Blue
            fields: [
              { name: 'Status', value: '✅ Active & Connected', inline: true },
              { name: 'System', value: 'Print Mart Attendance', inline: true },
            ],
            footer: {
              text: `Print Mart Assistant • ${new Date().toLocaleDateString()}`
            },
            timestamp: new Date().toISOString()
          }
        ]
      };

      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testPayload)
      });

      if (!res.ok) {
        const text = await res.text();
        return NextResponse.json(
          { success: false, message: `Discord API error (${res.status}): ${text}` },
          { status: res.status }
        );
      }

      return NextResponse.json({ success: true, message: 'Test message sent successfully to Discord!' });
    }

    // Handle Punch In / Punch Out Notification Payload
    const isPunchIn = type === 'punch_in';
    const title = isPunchIn ? '🟢 Employee Punched In' : '🔴 Employee Punched Out';
    const color = isPunchIn ? 3066993 : 15158332; // Green : Red

    const fields: Array<{ name: string; value: string; inline?: boolean }> = [
      { name: 'Employee', value: userName || 'Employee', inline: true },
      { name: 'Action', value: isPunchIn ? 'Punched In' : 'Punched Out', inline: true },
      { name: 'Work Mode', value: (workMode || 'office').toUpperCase(), inline: true },
      { name: 'Time', value: timeStr || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), inline: true },
      { name: 'Date', value: dateStr || new Date().toISOString().split('T')[0], inline: true },
    ];

    if (location && location.latitude && location.longitude) {
      fields.push({
        name: 'GPS Location',
        value: `[View on Google Maps](https://maps.google.com/?q=${location.latitude},${location.longitude})`,
        inline: false
      });
    }

    const payload = {
      username: 'Print Mart Attendance Bot',
      avatar_url: userPhoto || 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
      embeds: [
        {
          title,
          description: `**${userName || 'An employee'}** has **${isPunchIn ? 'punched in' : 'punched out'}**.`,
          color,
          fields,
          footer: {
            text: 'Print Mart Assistant • Attendance System'
          },
          timestamp: new Date().toISOString()
        }
      ]
    };

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Discord Webhook post error:", text);
      return NextResponse.json({ success: false, message: `Discord error: ${text}` }, { status: res.status });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Discord Webhook API error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
