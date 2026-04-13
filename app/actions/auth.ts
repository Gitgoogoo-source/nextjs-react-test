'use server';

import { createClient } from '@/lib/supabase/server';
import { validateTelegramWebAppData } from '@/lib/telegram';

export async function syncTelegramUser(initData: string) {
  try {
    const { isValid, user } = validateTelegramWebAppData(initData);

    if (!isValid || !user) {
      return { success: false, error: 'Invalid Telegram data' };
    }

    const supabase = await createClient();

    // Check if user exists
    const { data: existingUser, error: fetchError } = await supabase
      .from('profiles')
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
        .from('profiles')
        .update({
          username: user.username || existingUser.username,
          first_name: user.first_name || existingUser.first_name,
          last_name: user.last_name || existingUser.last_name,
          photo_url: user.photo_url || existingUser.photo_url,
          last_login_at: now,
        })
        .eq('telegram_id', user.id);

      if (updateError) {
        console.error('Error updating user:', updateError);
        return { success: false, error: 'Failed to update user' };
      }
    } else {
      // Create new user with 1000 balance
      const { error: insertError } = await supabase
        .from('profiles')
        .insert({
          telegram_id: user.id,
          username: user.username,
          first_name: user.first_name,
          last_name: user.last_name,
          photo_url: user.photo_url,
          balance: 1000,
          created_at: now,
          last_login_at: now,
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
