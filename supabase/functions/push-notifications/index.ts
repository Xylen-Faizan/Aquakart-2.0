import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req) => {
  try {
    const payload = await req.json()

    if (payload.type !== 'INSERT' || payload.table !== 'delivery_notifications') {
      return new Response("Ignored", { status: 200 })
    }

    const notification = payload.record

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Mark as processing
    await supabase
      .from('delivery_notifications')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', notification.id)

    // Get active user push tokens
    const { data: devices, error: deviceError } = await supabase
      .from('user_devices')
      .select('expo_push_token')
      .eq('user_id', notification.user_id)
      .eq('is_active', true)

    if (deviceError || !devices || devices.length === 0) {
      await supabase
        .from('delivery_notifications')
        .update({ 
          status: 'failed', 
          error_message: 'No active devices found in user_devices', 
          failed_at: new Date().toISOString() 
        })
        .eq('id', notification.id)
      return new Response("No devices found", { status: 200 })
    }

    const pushTokens = devices.map(d => d.expo_push_token)
    const expoMessage = {
      to: pushTokens,
      sound: 'default',
      title: notification.title,
      body: notification.body,
      data: notification.payload,
    }

    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(expoMessage),
    })

    const ticketResponse = await res.json()
    
    let hasError = false;
    let errorDetails = '';

    if (ticketResponse.errors) {
      hasError = true;
      errorDetails = JSON.stringify(ticketResponse.errors);
    } else if (ticketResponse.data) {
      // Check individual token tickets
      const tickets = ticketResponse.data;
      for (let i = 0; i < tickets.length; i++) {
        const ticket = tickets[i];
        if (ticket.status === 'error') {
          hasError = true;
          errorDetails += `Token ${pushTokens[i]} failed: ${ticket.message}. `;
          
          if (ticket.details && ticket.details.error === 'DeviceNotRegistered') {
            console.log(`Deactivating token: ${pushTokens[i]}`);
            await supabase
              .from('user_devices')
              .update({ is_active: false })
              .eq('expo_push_token', pushTokens[i])
              .eq('user_id', notification.user_id);
          }
        }
      }
    }

    if (hasError) {
      await supabase
        .from('delivery_notifications')
        .update({ 
          status: 'failed', 
          error_message: errorDetails, 
          failed_at: new Date().toISOString() 
        })
        .eq('id', notification.id)
    } else {
      await supabase
        .from('delivery_notifications')
        .update({ 
          status: 'sent', 
          sent_at: new Date().toISOString() 
        })
        .eq('id', notification.id)
    }

    return new Response(JSON.stringify(ticketResponse), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 400,
    })
  }
})
