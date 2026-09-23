import { createClient } from "@supabase/supabase-js";
const supabase = createClient("https://gmoethzwvoeuajfzqakn.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdtb2V0aHp3dm9ldWFqZnpxYWtuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzNzMxNDcsImV4cCI6MjEwNDk0OTE0N30.eQCfyYsA_1a_mlHAudmt1fWT6QwfKPkhIs5pVWTraYs");
async function check() {
  const {data, error} = await supabase.from("products").select("*");
  console.log("DATA:", data);
  console.log("ERROR:", error);
}
check();
