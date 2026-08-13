import { NextResponse } from 'next/server';

const DEFAULT_DISCORD_WEBHOOK_URL =
  'https://discordapp.com/api/webhooks/1537378498052755497/w9jjUvzUdf95EBFVTkqijyrhbqRBdinOWPIANrwePn-hSZF8Gsi0AmdAW3qKgJWug_CF';

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
      orderData,
      summaryData,
      webhookUrl: providedWebhookUrl,
      isTest
    } = body;

    const webhookUrl =
      providedWebhookUrl ||
      process.env.DISCORD_WEBHOOK_URL ||
      process.env.NEXT_PUBLIC_DISCORD_WEBHOOK_URL ||
      DEFAULT_DISCORD_WEBHOOK_URL;

    if (!webhookUrl || typeof webhookUrl !== 'string' || !webhookUrl.startsWith('http')) {
      return NextResponse.json(
        { success: false, message: 'No valid Discord Webhook URL configured' },
        { status: 400 }
      );
    }

    // 1. Handle Discord Webhook Test Request
    if (isTest) {
      const testPayload = {
        username: 'Print Mart Assistant',
        avatar_url: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
        embeds: [
          {
            title: '🔔 Discord Webhook Connected!',
            description: 'Print Mart Assistant has successfully connected to this Discord channel! Live orders, attendance, and daily summary reports will be dispatched here.',
            color: 3447003, // Blue
            fields: [
              { name: 'Status', value: '✅ Active & Connected', inline: true },
              { name: 'System', value: 'Print Mart Workflow', inline: true },
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

    // 2. Handle New Order Created Payload
    if (type === 'new_order' && orderData) {
      const payload = {
        username: 'Print Mart Orders Bot',
        avatar_url: 'https://cdn-icons-png.flaticon.com/512/3081/3081559.png',
        embeds: [
          {
            title: `📦 New Order Created - INFO #${orderData.infoNumber || 2412}`,
            description: `A new garment printing order **${orderData.orderNumber || ''}** has been registered in the system!`,
            color: 3447003, // Blue / Sapphire
            fields: [
              { name: 'INFO NO.', value: `#${orderData.infoNumber || 2412}`, inline: true },
              { name: 'Order Number', value: orderData.orderNumber || 'N/A', inline: true },
              { name: 'Customer Name', value: orderData.customerName || 'N/A', inline: true },
              { name: 'Customer Phone', value: orderData.customerPhone || 'N/A', inline: true },
              { name: 'Order Title', value: orderData.orderTitle || 'Standard Order', inline: true },
              { name: 'Garment / Fabric', value: `${orderData.itemType || 'JERSEY'} (${orderData.clothType || 'Standard'})`, inline: true },
              { name: 'Neck Type', value: orderData.neckType || 'Standard', inline: true },
              { name: 'Quantity (Pieces)', value: `👕 ${orderData.pieces || 1} pcs`, inline: true },
              { name: 'Total Amount', value: `₹${(orderData.totalAmount || 0).toLocaleString('en-IN')}`, inline: true },
              { name: 'Advance Paid', value: `₹${(orderData.advanceAmount || 0).toLocaleString('en-IN')}`, inline: true },
              { name: 'Balance Due', value: `₹${(orderData.balanceAmount || 0).toLocaleString('en-IN')}`, inline: true },
              { name: 'Delivery Date', value: `📅 ${orderData.deliveryDate || 'TBD'}`, inline: true },
              { name: 'Created By', value: orderData.createdByName || 'Staff', inline: true },
            ],
            footer: {
              text: 'Print Mart Assistant • Order Management System'
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
        console.error("Discord Order Webhook post error:", text);
        return NextResponse.json({ success: false, message: `Discord error: ${text}` }, { status: res.status });
      }

      return NextResponse.json({ success: true });
    }

    // 3. Handle Daily Order Summary Report Payload
    if (type === 'daily_summary' && summaryData) {
      const payload = {
        username: 'Print Mart Analytics Bot',
        avatar_url: 'https://cdn-icons-png.flaticon.com/512/3589/3589998.png',
        embeds: [
          {
            title: `📊 Daily Orders Summary Report (${dateStr || new Date().toISOString().split('T')[0]})`,
            description: `Here is the comprehensive production and orders summary report for **Print Mart**:`,
            color: 15844367, // Gold / Amber
            fields: [
              { name: '📦 Total Orders', value: `${summaryData.totalOrders || 0} orders`, inline: true },
              { name: '👕 Total Pieces', value: `${summaryData.totalPieces || 0} pcs`, inline: true },
              { name: '💰 Total Order Value', value: `₹${(summaryData.totalAmount || 0).toLocaleString('en-IN')}`, inline: true },
              { name: '💵 Advance Collected', value: `₹${(summaryData.totalAdvance || 0).toLocaleString('en-IN')}`, inline: true },
              { name: '💳 Balance Pending', value: `₹${(summaryData.totalBalance || 0).toLocaleString('en-IN')}`, inline: true },
              { name: '⏳ Pending Orders', value: `${summaryData.pendingCount || 0}`, inline: true },
              { name: '⚙️ In Production', value: `${summaryData.productionCount || 0}`, inline: true },
              { name: '🚚 Ready / Delivered', value: `${(summaryData.readyCount || 0) + (summaryData.deliveredCount || 0)}`, inline: true },
            ],
            footer: {
              text: 'Print Mart Assistant • Daily Analytics Report'
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
        console.error("Discord Summary Webhook post error:", text);
        return NextResponse.json({ success: false, message: `Discord error: ${text}` }, { status: res.status });
      }

      return NextResponse.json({ success: true, message: 'Daily Order Summary sent to Discord!' });
    }

    // 4. Handle Punch In / Punch Out Notification Payload (Default)
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
