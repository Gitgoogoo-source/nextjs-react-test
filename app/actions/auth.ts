'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { validateTelegramWebAppData } from '@/lib/telegram';

export async function syncTelegramUser(initData: string) {
  try {
    const { isValid, user, reason } = validateTelegramWebAppData(initData);

    if (!isValid || !user) {
      if (reason === 'missing_bot_token') {
        return { success: false, error: 'Server configuration error: TELEGRAM_BOT_TOKEN missing' };
      }

      return { success: false, error: 'Invalid Telegram data' };
    }

    let supabase;
    try {
      supabase = createAdminClient();
    } catch (error) {
      console.error('Error creating admin client:', error);
      return { success: false, error: 'Server configuration error: SUPABASE_SERVICE_ROLE_KEY missing' };
    }

    // Check if user exists
    const { data: existingUser, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', user.id)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 means no rows returned
      console.error('Error fetching user:', fetchError);
      return { success: false, error: 'Database error' };
    }

    const now = new Date().toISOString();

    if (existingUser) {
      // Update last login
      const { error: updateError } = await supabase
        .from('users')
        .update({
          username: user.username || existingUser.username,
          first_name: user.first_name || existingUser.first_name,
          last_name: user.last_name || existingUser.last_name,
          avatar_url: user.photo_url || existingUser.avatar_url,
          updated_at: now,
          balance: typeof existingUser.balance === 'number' ? existingUser.balance : 1000,
        })
        .eq('telegram_id', user.id);

      if (updateError) {
        console.error('Error updating user:', updateError);
        return { success: false, error: 'Failed to update user' };
      }
    } else {
      // Create new user with 1000 balance
      const { error: insertError } = await supabase
        .from('users')
        .insert({
          telegram_id: user.id,
          username: user.username,
          first_name: user.first_name,
          last_name: user.last_name,
          avatar_url: user.photo_url,
          balance: 1000,
          created_at: now,
          updated_at: now,
        });

      if (insertError) {
        console.error('Error creating user:', insertError);
        return { success: false, error: 'Failed to create user' };
      }
    }

    return { success: true, user };
  } catch (error) {
    console.error('Sync error:', error);
    return { success: false, error: 'Internal server error' };
  }
}
