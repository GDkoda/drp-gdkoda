export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      characters: {
        Row: {
          a: number
          advantages: Json
          concept: string
          created_at: string
          custom_rolls: Json
          disadvantages: Json
          f: number
          fa_bonus: number
          fd_bonus: number
          h: number
          id: string
          known_spells: string[]
          name: string
          notes: string
          owner_id: string
          pdf: number
          pm_current: number
          pp_total: number
          pv_current: number
          r: number
          skills: Json
          updated_at: string
          xp: number
        }
        Insert: {
          a?: number
          advantages?: Json
          concept?: string
          created_at?: string
          custom_rolls?: Json
          disadvantages?: Json
          f?: number
          fa_bonus?: number
          fd_bonus?: number
          h?: number
          id?: string
          known_spells?: string[]
          name?: string
          notes?: string
          owner_id: string
          pdf?: number
          pm_current?: number
          pp_total?: number
          pv_current?: number
          r?: number
          skills?: Json
          updated_at?: string
          xp?: number
        }
        Update: {
          a?: number
          advantages?: Json
          concept?: string
          created_at?: string
          custom_rolls?: Json
          disadvantages?: Json
          f?: number
          fa_bonus?: number
          fd_bonus?: number
          h?: number
          id?: string
          known_spells?: string[]
          name?: string
          notes?: string
          owner_id?: string
          pdf?: number
          pm_current?: number
          pp_total?: number
          pv_current?: number
          r?: number
          skills?: Json
          updated_at?: string
          xp?: number
        }
        Relationships: []
      }
      chest_items: {
        Row: {
          bonus: Json
          category: string
          created_at: string
          description: string
          equipped_character_id: string | null
          id: string
          name: string
          owner_id: string
        }
        Insert: {
          bonus?: Json
          category: string
          created_at?: string
          description?: string
          equipped_character_id?: string | null
          id?: string
          name: string
          owner_id: string
        }
        Update: {
          bonus?: Json
          category?: string
          created_at?: string
          description?: string
          equipped_character_id?: string | null
          id?: string
          name?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chest_items_equipped_character_id_fkey"
            columns: ["equipped_character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
        ]
      }
      combat_sessions: {
        Row: {
          battle_log: Json
          character_id: string
          created_at: string
          hero_a: number
          hero_aim_bonus: number
          hero_f: number
          hero_guard_bonus: number
          hero_h: number
          hero_known_spells: string[]
          hero_max_pm: number
          hero_max_pv: number
          hero_name: string
          hero_pdf: number
          hero_pm: number
          hero_pv: number
          hero_r: number
          hero_traits: Json
          id: string
          monster_a: number
          monster_f: number
          monster_guard_bonus: number
          monster_guard_used: boolean
          monster_h: number
          monster_max_pv: number
          monster_name: string
          monster_pdf: number
          monster_pv: number
          monster_reward: number | null
          monster_strategy: string
          monster_weakened: number
          monster_xp: number
          reward_paid: boolean
          status: string
          turn_number: number
          updated_at: string
          user_id: string
        }
        Insert: {
          battle_log?: Json
          character_id: string
          created_at?: string
          hero_a: number
          hero_aim_bonus?: number
          hero_f: number
          hero_guard_bonus?: number
          hero_h: number
          hero_known_spells?: string[]
          hero_max_pm: number
          hero_max_pv: number
          hero_name: string
          hero_pdf: number
          hero_pm: number
          hero_pv: number
          hero_r?: number
          hero_traits?: Json
          id?: string
          monster_a: number
          monster_f: number
          monster_guard_bonus?: number
          monster_guard_used?: boolean
          monster_h: number
          monster_max_pv: number
          monster_name: string
          monster_pdf: number
          monster_pv: number
          monster_reward?: number | null
          monster_strategy?: string
          monster_weakened?: number
          monster_xp?: number
          reward_paid?: boolean
          status?: string
          turn_number?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          battle_log?: Json
          character_id?: string
          created_at?: string
          hero_a?: number
          hero_aim_bonus?: number
          hero_f?: number
          hero_guard_bonus?: number
          hero_h?: number
          hero_known_spells?: string[]
          hero_max_pm?: number
          hero_max_pv?: number
          hero_name?: string
          hero_pdf?: number
          hero_pm?: number
          hero_pv?: number
          hero_r?: number
          hero_traits?: Json
          id?: string
          monster_a?: number
          monster_f?: number
          monster_guard_bonus?: number
          monster_guard_used?: boolean
          monster_h?: number
          monster_max_pv?: number
          monster_name?: string
          monster_pdf?: number
          monster_pv?: number
          monster_reward?: number | null
          monster_strategy?: string
          monster_weakened?: number
          monster_xp?: number
          reward_paid?: boolean
          status?: string
          turn_number?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "combat_sessions_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
        ]
      }
      farkle_games: {
        Row: {
          created_at: string
          finished_at: string | null
          id: string
          payout: number
          result_won: boolean | null
          status: string
          user_id: string
          wager: number
        }
        Insert: {
          created_at?: string
          finished_at?: string | null
          id?: string
          payout?: number
          result_won?: boolean | null
          status?: string
          user_id: string
          wager?: number
        }
        Update: {
          created_at?: string
          finished_at?: string | null
          id?: string
          payout?: number
          result_won?: boolean | null
          status?: string
          user_id?: string
          wager?: number
        }
        Relationships: [
          {
            foreignKeyName: "farkle_games_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fractal_player_state: {
        Row: {
          completed_corruptions: number[]
          corruption_unlocked: number
          fractals: number
          purchased_upgrades: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_corruptions?: number[]
          corruption_unlocked?: number
          fractals?: number
          purchased_upgrades?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_corruptions?: number[]
          corruption_unlocked?: number
          fractals?: number
          purchased_upgrades?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fractal_player_state_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fractal_runs: {
        Row: {
          corruption_level: number
          finished_at: string | null
          id: string
          started_at: string
          status: string
          user_id: string
        }
        Insert: {
          corruption_level: number
          finished_at?: string | null
          id?: string
          started_at?: string
          status?: string
          user_id: string
        }
        Update: {
          corruption_level?: number
          finished_at?: string | null
          id?: string
          started_at?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fractal_runs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      game_settings: {
        Row: {
          checkin_per_day: number
          combat_loss: number
          combat_win_base: number
          combat_win_per_level: number
          dice_max_bet: number
          id: number
          puzzle_reward: number
          updated_at: string
          vigor_cost_1: number
          vigor_cost_5: number
          vigor_daily: number
        }
        Insert: {
          checkin_per_day?: number
          combat_loss?: number
          combat_win_base?: number
          combat_win_per_level?: number
          dice_max_bet?: number
          id?: number
          puzzle_reward?: number
          updated_at?: string
          vigor_cost_1?: number
          vigor_cost_5?: number
          vigor_daily?: number
        }
        Update: {
          checkin_per_day?: number
          combat_loss?: number
          combat_win_base?: number
          combat_win_per_level?: number
          dice_max_bet?: number
          id?: number
          puzzle_reward?: number
          updated_at?: string
          vigor_cost_1?: number
          vigor_cost_5?: number
          vigor_daily?: number
        }
        Relationships: []
      }
      lore_attachments: {
        Row: {
          created_at: string
          entry_id: string
          file_name: string
          file_size: number
          id: string
          mime_type: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          entry_id: string
          file_name: string
          file_size?: number
          id?: string
          mime_type?: string
          storage_path: string
        }
        Update: {
          created_at?: string
          entry_id?: string
          file_name?: string
          file_size?: number
          id?: string
          mime_type?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "lore_attachments_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "lore_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      lore_categories: {
        Row: {
          created_at: string
          description: string
          id: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      lore_comments: {
        Row: {
          content: string
          created_at: string
          entry_id: string
          id: string
          pinned: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          entry_id: string
          id?: string
          pinned?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          entry_id?: string
          id?: string
          pinned?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lore_comments_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "lore_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lore_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lore_entries: {
        Row: {
          allowed_groups: string[]
          allowed_users: string[]
          category_id: string | null
          content: string
          cover_image_url: string | null
          created_at: string
          created_by: string
          id: string
          published_at: string | null
          related_ids: string[]
          status: string
          summary: string
          tags: string[]
          title: string
          updated_at: string
          updated_by: string | null
          visibility: string
        }
        Insert: {
          allowed_groups?: string[]
          allowed_users?: string[]
          category_id?: string | null
          content?: string
          cover_image_url?: string | null
          created_at?: string
          created_by: string
          id?: string
          published_at?: string | null
          related_ids?: string[]
          status?: string
          summary?: string
          tags?: string[]
          title: string
          updated_at?: string
          updated_by?: string | null
          visibility?: string
        }
        Update: {
          allowed_groups?: string[]
          allowed_users?: string[]
          category_id?: string | null
          content?: string
          cover_image_url?: string | null
          created_at?: string
          created_by?: string
          id?: string
          published_at?: string | null
          related_ids?: string[]
          status?: string
          summary?: string
          tags?: string[]
          title?: string
          updated_at?: string
          updated_by?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "lore_entries_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "lore_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      lore_group_members: {
        Row: {
          created_at: string
          group_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lore_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "lore_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lore_group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lore_groups: {
        Row: {
          created_at: string
          description: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      monsters: {
        Row: {
          a: number
          active: boolean
          created_at: string
          f: number
          h: number
          id: string
          image_url: string | null
          name: string
          pdf: number
          pv: number
          reward: number | null
          xp: number
        }
        Insert: {
          a?: number
          active?: boolean
          created_at?: string
          f?: number
          h?: number
          id?: string
          image_url?: string | null
          name: string
          pdf?: number
          pv?: number
          reward?: number | null
          xp?: number
        }
        Update: {
          a?: number
          active?: boolean
          created_at?: string
          f?: number
          h?: number
          id?: string
          image_url?: string | null
          name?: string
          pdf?: number
          pv?: number
          reward?: number | null
          xp?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active_character_id: string | null
          checkin_streak: number
          coins: number
          created_at: string
          display_name: string
          id: string
          last_checkin: string | null
          username: string
          vigor: number
          vigor_date: string
        }
        Insert: {
          active_character_id?: string | null
          checkin_streak?: number
          coins?: number
          created_at?: string
          display_name: string
          id: string
          last_checkin?: string | null
          username: string
          vigor?: number
          vigor_date?: string
        }
        Update: {
          active_character_id?: string | null
          checkin_streak?: number
          coins?: number
          created_at?: string
          display_name?: string
          id?: string
          last_checkin?: string | null
          username?: string
          vigor?: number
          vigor_date?: string
        }
        Relationships: []
      }
      puzzle_sessions: {
        Row: {
          answer: string
          created_at: string
          expires_at: string
          id: string
          reward: number | null
          solved: boolean | null
          user_id: string
        }
        Insert: {
          answer: string
          created_at?: string
          expires_at?: string
          id?: string
          reward?: number | null
          solved?: boolean | null
          user_id: string
        }
        Update: {
          answer?: string
          created_at?: string
          expires_at?: string
          id?: string
          reward?: number | null
          solved?: boolean | null
          user_id?: string
        }
        Relationships: []
      }
      puzzles: {
        Row: {
          active: boolean
          answer: string
          created_at: string
          id: string
          question: string
          reward: number | null
        }
        Insert: {
          active?: boolean
          answer: string
          created_at?: string
          id?: string
          question: string
          reward?: number | null
        }
        Update: {
          active?: boolean
          answer?: string
          created_at?: string
          id?: string
          question?: string
          reward?: number | null
        }
        Relationships: []
      }
      shop_items: {
        Row: {
          active: boolean
          bonus: Json
          category: string
          created_at: string
          description: string
          id: string
          name: string
          price: number
        }
        Insert: {
          active?: boolean
          bonus?: Json
          category?: string
          created_at?: string
          description?: string
          id?: string
          name: string
          price?: number
        }
        Update: {
          active?: boolean
          bonus?: Json
          category?: string
          created_at?: string
          description?: string
          id?: string
          name?: string
          price?: number
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          appearance: Json
          id: number
          texts: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          appearance?: Json
          id?: number
          texts?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          appearance?: Json
          id?: number
          texts?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      spells: {
        Row: {
          combat_effect: string
          combat_enabled: boolean
          combat_power: number
          cost: string
          created_at: string
          description: string
          duration: string
          id: string
          name: string
          pm_cost: number
          range: string
          requirements: string
          school: string
          source: string
        }
        Insert: {
          combat_effect?: string
          combat_enabled?: boolean
          combat_power?: number
          cost?: string
          created_at?: string
          description?: string
          duration?: string
          id?: string
          name: string
          pm_cost?: number
          range?: string
          requirements?: string
          school?: string
          source?: string
        }
        Update: {
          combat_effect?: string
          combat_enabled?: boolean
          combat_power?: number
          cost?: string
          created_at?: string
          description?: string
          duration?: string
          id?: string
          name?: string
          pm_cost?: number
          range?: string
          requirements?: string
          school?: string
          source?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          coins: number
          created_at: string
          from_user: string | null
          id: string
          item_name: string | null
          kind: string
          note: string | null
          to_user: string | null
        }
        Insert: {
          coins?: number
          created_at?: string
          from_user?: string | null
          id?: string
          item_name?: string | null
          kind: string
          note?: string | null
          to_user?: string | null
        }
        Update: {
          coins?: number
          created_at?: string
          from_user?: string | null
          id?: string
          item_name?: string | null
          kind?: string
          note?: string | null
          to_user?: string | null
        }
        Relationships: []
      }
      twentyone_games: {
        Row: {
          created_at: string
          dealer_cards: Json
          deck: Json
          finished_at: string | null
          id: string
          payout: number
          player_cards: Json
          status: string
          user_id: string
          wager: number
        }
        Insert: {
          created_at?: string
          dealer_cards?: Json
          deck?: Json
          finished_at?: string | null
          id?: string
          payout?: number
          player_cards?: Json
          status?: string
          user_id: string
          wager?: number
        }
        Update: {
          created_at?: string
          dealer_cards?: Json
          deck?: Json
          finished_at?: string | null
          id?: string
          payout?: number
          player_cards?: Json
          status?: string
          user_id?: string
          wager?: number
        }
        Relationships: [
          {
            foreignKeyName: "twentyone_games_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _br_today: { Args: never; Returns: string }
      _combat_state: {
        Args: { _s: Database["public"]["Tables"]["combat_sessions"]["Row"] }
        Returns: Json
      }
      _reward: {
        Args: { _coins: number; _kind: string; _note: string }
        Returns: undefined
      }
      _spend_vigor: { Args: { _n: number }; Returns: undefined }
      _twentyone_finish: {
        Args: {
          _dealer_cards: Json
          _game: Database["public"]["Tables"]["twentyone_games"]["Row"]
          _outcome: string
        }
        Returns: {
          created_at: string
          dealer_cards: Json
          deck: Json
          finished_at: string | null
          id: string
          payout: number
          player_cards: Json
          status: string
          user_id: string
          wager: number
        }
        SetofOptions: {
          from: "*"
          to: "twentyone_games"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _twentyone_hand: { Args: { _cards: Json }; Returns: Json }
      _twentyone_state: {
        Args: { _game: Database["public"]["Tables"]["twentyone_games"]["Row"] }
        Returns: Json
      }
      buy_item: { Args: { _item: string }; Returns: undefined }
      can_read_lore_entry: { Args: { _entry: string }; Returns: boolean }
      cast_spell: {
        Args: { _char: string; _pm?: number; _spell: string }
        Returns: number
      }
      daily_checkin: { Args: never; Returns: number }
      equip_item: {
        Args: { _char: string; _chest: string }
        Returns: undefined
      }
      exchange_fractals_for_coins: {
        Args: { _fractals: number }
        Returns: Json
      }
      expire_puzzle: { Args: { _id: string }; Returns: Json }
      finish_farkle_game: {
        Args: { _game: string; _won: boolean }
        Returns: Json
      }
      finish_fractal_run: {
        Args: { _run_id: string; _victory: boolean }
        Returns: Json
      }
      get_active_combat: { Args: never; Returns: Json }
      get_active_twentyone_game: { Args: never; Returns: Json }
      get_combat_state: { Args: { _session_id: string }; Returns: Json }
      get_fractal_state: { Args: never; Returns: Json }
      get_puzzle_time_limit_seconds: { Args: never; Returns: number }
      get_vigor: { Args: never; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      master_adjust_coins: {
        Args: { _delta: number; _note: string; _user: string }
        Returns: undefined
      }
      master_adjust_vigor: {
        Args: { _delta: number; _user: string }
        Returns: undefined
      }
      master_give_item: {
        Args: { _item: string; _user: string }
        Returns: undefined
      }
      master_purge_user: { Args: { _user: string }; Returns: undefined }
      perform_combat_action: {
        Args: { _action: string; _session_id: string; _spell_id?: string }
        Returns: Json
      }
      play_combat: { Args: never; Returns: Json }
      play_dice: { Args: { _bet: number }; Returns: Json }
      purchase_fractal_upgrade: { Args: { _upgrade: string }; Returns: Json }
      restore_vigor: { Args: { _amount: number }; Returns: number }
      set_lore_comment_pinned: {
        Args: { _comment: string; _pinned: boolean }
        Returns: undefined
      }
      solve_puzzle: { Args: { _answer: string; _id: string }; Returns: Json }
      start_combat: { Args: never; Returns: Json }
      start_farkle_game: { Args: never; Returns: number }
      start_farkle_game_with_bet: { Args: { _wager: number }; Returns: string }
      start_fractal_run: { Args: { _corruption: number; _weapon?: string; _omen?: string | null }; Returns: string }
      start_puzzle: { Args: never; Returns: Json }
      start_twentyone_game: { Args: { _wager: number }; Returns: Json }
      transfer_coins: {
        Args: { _amount: number; _to: string }
        Returns: undefined
      }
      transfer_item: {
        Args: { _chest: string; _to: string }
        Returns: undefined
      }
      twentyone_hit: { Args: { _game_id: string }; Returns: Json }
      twentyone_stand: { Args: { _game_id: string }; Returns: Json }
      use_consumable: { Args: { _chest: string }; Returns: undefined }
    }
    Enums: {
      app_role: "master" | "player"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["master", "player"],
    },
  },
} as const
