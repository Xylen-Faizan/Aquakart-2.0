import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req) => {
  try {
    const payload = await req.json()

    // 1. Validate payload is an INSERT from delivery_notifications
    if (payload.type !== 'INSERT' || payload.table !== 'delivery_notifications') {
      return new Response("Ignored", { status: 200 })
    }

    const notification = payload.record

    // 2. Initialize Supabase Client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 3. Mark as processing
    await supabase
      .from('delivery_notifications')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', notification.id)

    // 4. Get User Push Token
    const { data: devices, error: deviceError } = await supabase
      .from('user_devices')
      .select('expo_push_token')
      .eq('user_id', notification.user_id)
      .eq('is_active', true)

    if (deviceError || !devices || devices.length === 0) {
      await supabase
        .from('delivery_notifications')
        .update({ status: 'failed', error_message: 'No active devices found', failed_at: new Date().toISOString() })
        .eq('id', notification.id)
      return new Response("No devices found", { status: 200 })
    }

    // 5. Send to Expo Push API
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
    
    // Simplistic error handling for MVP
    if (ticketResponse.errors) {
      await supabase
        .from('delivery_notifications')
        .update({ 
          status: 'failed', 
          error_message: JSON.stringify(ticketResponse.errors), 
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
