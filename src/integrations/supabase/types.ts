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
          disadvantages: Json
          f: number
          h: number
          id: string
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
          disadvantages?: Json
          f?: number
          h?: number
          id?: string
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
          disadvantages?: Json
          f?: number
          h?: number
          id?: string
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
          id: string
          solved: boolean | null
          user_id: string
        }
        Insert: {
          answer: string
          created_at?: string
          id?: string
          solved?: boolean | null
          user_id: string
        }
        Update: {
          answer?: string
          created_at?: string
          id?: string
          solved?: boolean | null
          user_id?: string
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
      _reward: {
        Args: { _coins: number; _kind: string; _note: string }
        Returns: undefined
      }
      _spend_vigor: { Args: { _n: number }; Returns: undefined }
      buy_item: { Args: { _item: string }; Returns: undefined }
      daily_checkin: { Args: never; Returns: number }
      equip_item: {
        Args: { _char: string; _chest: string }
        Returns: undefined
      }
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
      master_give_item: {
        Args: { _item: string; _user: string }
        Returns: undefined
      }
      play_combat: { Args: never; Returns: Json }
      play_dice: { Args: { _bet: number }; Returns: Json }
      solve_puzzle: { Args: { _answer: string; _id: string }; Returns: Json }
      start_puzzle: { Args: never; Returns: Json }
      transfer_coins: {
        Args: { _amount: number; _to: string }
        Returns: undefined
      }
      transfer_item: {
        Args: { _chest: string; _to: string }
        Returns: undefined
      }
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
