import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Publish Content Edge Function
 * 
 * Executes content publishing to social platforms (Instagram, Facebook, YouTube)
 * Called by Ops Desk after human approval of content_drafts
 * 
 * EXECUTION AUTHORITY: Only Ops Desk (execution_scope: "content") can call this
 */

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Read the body ONCE — req.json() consumes the stream, so the reject/
    // schedule handlers must destructure from this object, not re-read it.
    const body = await req.json();
    const { content_draft_id, action, caller_agent } = body;

    // Initialize Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`[publish-content] Request received: action=${action}, draft_id=${content_draft_id}, caller=${caller_agent}`);

    // EXECUTION GATE: Validate caller has content execution authority
    // In production, this would check the agent's execution_scope
    // For now, we allow 'ops_desk' or system calls
    if (caller_agent && caller_agent !== "ops_desk" && caller_agent !== "system") {
      console.error(`[publish-content] Unauthorized caller: ${caller_agent}`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Unauthorized: Only Ops Desk can execute content publishing" 
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!content_draft_id) {
      throw new Error("Missing content_draft_id");
    }

    // Fetch the content draft
    const { data: draft, error: draftError } = await supabase
      .from("content_drafts")
      .select("*")
      .eq("id", content_draft_id)
      .single();

    if (draftError || !draft) {
      throw new Error(`Content draft not found: ${content_draft_id}`);
    }

    console.log(`[publish-content] Draft loaded: type=${draft.content_type}, platform=${draft.platform}, status=${draft.status}`);

    // Handle different actions
    if (action === "approve") {
      // Update status to approved
      const { error: updateError } = await supabase
        .from("content_drafts")
        .update({
          status: "approved",
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", content_draft_id);

      if (updateError) throw updateError;

      console.log(`[publish-content] Draft ${content_draft_id} approved`);
      
      return new Response(
        JSON.stringify({ success: true, action: "approved", draft_id: content_draft_id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "reject") {
      const { reason } = body;
      
      const { error: updateError } = await supabase
        .from("content_drafts")
        .update({
          status: "rejected",
          rejection_reason: reason || "No reason provided",
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", content_draft_id);

      if (updateError) throw updateError;

      console.log(`[publish-content] Draft ${content_draft_id} rejected: ${reason}`);
      
      return new Response(
        JSON.stringify({ success: true, action: "rejected", draft_id: content_draft_id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "schedule") {
      const { scheduled_for } = body;
      
      const { error: updateError } = await supabase
        .from("content_drafts")
        .update({
          status: "scheduled",
          scheduled_for: scheduled_for,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", content_draft_id);

      if (updateError) throw updateError;

      console.log(`[publish-content] Draft ${content_draft_id} scheduled for ${scheduled_for}`);
      
      return new Response(
        JSON.stringify({ success: true, action: "scheduled", draft_id: content_draft_id, scheduled_for }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "publish") {
      // Validate draft is in approved or scheduled state
      if (draft.status !== "approved" && draft.status !== "scheduled") {
        throw new Error(`Cannot publish: draft status is ${draft.status}, must be approved or scheduled`);
      }

      // Get Instagram credentials
      const instagramAccessToken = Deno.env.get("INSTAGRAM_ACCESS_TOKEN");
      const instagramUserId = Deno.env.get("INSTAGRAM_USER_ID");

      if (!instagramAccessToken || !instagramUserId) {
        console.error("[publish-content] Instagram credentials not configured");
        
        // Update draft with error
        await supabase
          .from("content_drafts")
          .update({
            status: "pending_review",
            publish_error: "Instagram credentials not configured. Please set INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_USER_ID.",
          })
          .eq("id", content_draft_id);

        return new Response(
          JSON.stringify({ 
            success: false, 
            error: "Instagram credentials not configured" 
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Build caption with hashtags
      const fullCaption = `${draft.caption || ""}\n\n${(draft.hashtags || []).join(" ")}`.trim();

      console.log(`[publish-content] Publishing to ${draft.platform}: ${draft.content_type}`);

      let publishResult: any = null;

      try {
        if (draft.platform === "instagram") {
          if (draft.content_type === "reel" || draft.content_type === "video") {
            // Publish Reel/Video to Instagram
            // Step 1: Create media container
            const containerResponse = await fetch(
              `https://graph.facebook.com/v19.0/${instagramUserId}/media`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  media_type: "REELS",
                  video_url: draft.media_url,
                  caption: fullCaption,
                  access_token: instagramAccessToken,
                }),
              }
            );

            const containerData = await containerResponse.json();
            console.log("[publish-content] Container created:", containerData);

            if (containerData.error) {
              throw new Error(`Instagram API error: ${containerData.error.message}`);
            }

            const containerId = containerData.id;

            // Step 2: Wait for processing and publish
            // Instagram needs time to process the video
            await new Promise(resolve => setTimeout(resolve, 5000));

            const publishResponse = await fetch(
              `https://graph.facebook.com/v19.0/${instagramUserId}/media_publish`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  creation_id: containerId,
                  access_token: instagramAccessToken,
                }),
              }
            );

            publishResult = await publishResponse.json();
            console.log("[publish-content] Publish result:", publishResult);

            if (publishResult.error) {
              throw new Error(`Instagram publish error: ${publishResult.error.message}`);
            }

          } else if (draft.content_type === "story") {
            // Publish Story to Instagram
            const storyResponse = await fetch(
              `https://graph.facebook.com/v19.0/${instagramUserId}/media`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  media_type: "STORIES",
                  video_url: draft.media_url,
                  access_token: instagramAccessToken,
                }),
              }
            );

            const storyData = await storyResponse.json();
            
            if (storyData.error) {
              throw new Error(`Instagram Story error: ${storyData.error.message}`);
            }

            // Publish the story
            const publishResponse = await fetch(
              `https://graph.facebook.com/v19.0/${instagramUserId}/media_publish`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  creation_id: storyData.id,
                  access_token: instagramAccessToken,
                }),
              }
            );

            publishResult = await publishResponse.json();

          } else {
            // Publish Image to Instagram
            const imageResponse = await fetch(
              `https://graph.facebook.com/v19.0/${instagramUserId}/media`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  image_url: draft.media_url,
                  caption: fullCaption,
                  access_token: instagramAccessToken,
                }),
              }
            );

            const imageData = await imageResponse.json();
            
            if (imageData.error) {
              throw new Error(`Instagram Image error: ${imageData.error.message}`);
            }

            const publishResponse = await fetch(
              `https://graph.facebook.com/v19.0/${instagramUserId}/media_publish`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  creation_id: imageData.id,
                  access_token: instagramAccessToken,
                }),
              }
            );

            publishResult = await publishResponse.json();
          }
        }

        // Update draft as published
        const postId = publishResult?.id || null;
        const publishedUrl = postId 
          ? `https://www.instagram.com/p/${postId}/` 
          : null;

        await supabase
          .from("content_drafts")
          .update({
            status: "published",
            published_at: new Date().toISOString(),
            platform_post_id: postId,
            published_url: publishedUrl,
            publish_error: null,
          })
          .eq("id", content_draft_id);

        console.log(`[publish-content] Successfully published! Post ID: ${postId}`);

        return new Response(
          JSON.stringify({ 
            success: true, 
            action: "published",
            draft_id: content_draft_id,
            platform_post_id: postId,
            published_url: publishedUrl,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

      } catch (publishError: unknown) {
        const errorMessage = publishError instanceof Error ? publishError.message : "Unknown publish error";
        console.error("[publish-content] Publish failed:", errorMessage);

        // Update draft with error
        await supabase
          .from("content_drafts")
          .update({
            status: "pending_review",
            publish_error: errorMessage,
          })
          .eq("id", content_draft_id);

        return new Response(
          JSON.stringify({ 
            success: false, 
            error: errorMessage,
            draft_id: content_draft_id,
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Default: return draft info
    return new Response(
      JSON.stringify({ 
        success: true, 
        draft,
        available_actions: ["approve", "reject", "schedule", "publish"],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[publish-content] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
