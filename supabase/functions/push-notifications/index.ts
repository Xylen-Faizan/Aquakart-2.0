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

    await supabase
      .from('delivery_notifications')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', notification.id)

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
          error_message: deviceError?.message ?? 'No active devices found in user_devices',
          failed_at: new Date().toISOString()
        })
        .eq('id', notification.id)

      return new Response("No active devices found", { status: 200 })
    }

    const pushTokens = [...new Set(
      devices
        .map(d => d.expo_push_token)
        .filter(Boolean)
    )]

    if (pushTokens.length === 0) {
      await supabase
        .from('delivery_notifications')
        .update({
          status: 'failed',
          error_message: 'Active device rows contained no Expo push tokens',
          failed_at: new Date().toISOString()
        })
        .eq('id', notification.id)
      return new Response("No push tokens", { status: 200 })
    }

    const expoMessage = {
      to: pushTokens,
      sound: 'default',
      title: notification.title,
      body: notification.body,
      data: notification.payload ?? {},
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
    let hasError = !res.ok
    let errorDetails = res.ok ? '' : JSON.stringify(ticketResponse)

    if (ticketResponse.data && Array.isArray(ticketResponse.data)) {
      for (let i = 0; i < ticketResponse.data.length; i++) {
        const ticket = ticketResponse.data[i]
        if (ticket.status === 'error') {
          hasError = true
          errorDetails += `Token ${pushTokens[i]} failed: ${ticket.message ?? 'unknown error'}. `

          if (ticket.details?.error === 'DeviceNotRegistered') {
            await supabase
              .from('user_devices')
              .update({ is_active: false })
              .eq('expo_push_token', pushTokens[i])
              .eq('user_id', notification.user_id)
          }
        }
      }
    }

    if (hasError) {
      await supabase
        .from('delivery_notifications')
        .update({
          status: 'failed',
          error_message: errorDetails || 'Expo push request failed',
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
      status: res.ok ? 200 : 502,
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 400,
    })
  }
})
