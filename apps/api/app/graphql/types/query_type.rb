# frozen_string_literal: true

module Types
  class QueryType < Types::BaseObject
    field :node, Types::NodeType, null: true, description: "Fetches an object given its ID." do
      argument :id, ID, required: true, description: "ID of the object."
    end

    def node(id:)
      context.schema.object_from_id(id, context)
    end

    field :nodes, [ Types::NodeType, null: true ], null: true, description: "Fetches a list of objects given a list of IDs." do
      argument :ids, [ ID ], required: true, description: "IDs of the objects."
    end

    def nodes(ids:)
      ids.map { |id| context.schema.object_from_id(id, context) }
    end

    # Add root-level fields here.
    # They will be entry points for queries on your schema.

    field :categories, [ Types::CategoryType ], null: false, description: "全カテゴリ一覧"
    def categories
      Category.all
    end

    field :category, Types::CategoryType, null: true, description: "ID指定でカテゴリを1件取得" do
      argument :id, ID, required: true
    end
    def category(id:)
      Category.find_by(id: id)
    end

    field :transaction, Types::TransactionType, null: true, description: "ID指定で取引を1件取得" do
      argument :id, ID, required: true
    end
    def transaction(id:)
      Transaction.find_by(id: id)
    end

    field :budgets, [ Types::BudgetType ], null: false, description: "予算一覧（月フィルタ可）" do
      argument :month, Scalars::DateType, required: false, description: "対象月（省略時は全件）"
    end
    def budgets(month: nil)
      month ? Budget.where(month: month) : Budget.all
    end

    field :transactions, resolver: Resolvers::TransactionsResolver, description: "取引一覧（フィルタ可）"

    field :monthly_summary, Types::MonthlySummaryType, null: false, description: "月次支出集計" do
      argument :year,  Integer, required: true
      argument :month, Integer, required: true
    end
    def monthly_summary(year:, month:)
      ::MonthlySummaryService.new(year: year, month: month).call
    end

    field :alert_settings, Types::AlertSettingsType, null: false, description: "全アラート設定"
    def alert_settings
      ::Struct.new(:budget_alert_settings, :pace_alert_settings).new(
        BudgetAlertSetting.all,
        PaceAlertSetting.all
      )
    end

    field :notifications, Types::NotificationType.connection_type, null: false, description: "通知一覧" do
      argument :unread_only, Boolean, required: false, default_value: false, description: "未読のみ取得"
    end
    def notifications(unread_only: false)
      scope = Notification.all.order(created_at: :desc)
      unread_only ? scope.where(read_at: nil) : scope
    end

    field :store_mappings, [ Types::StoreCategoryMappingType ], null: false, description: "店名→カテゴリのマッピング一覧"
    def store_mappings
      StoreCategoryMapping.all.order(:store_name)
    end
  end
end
