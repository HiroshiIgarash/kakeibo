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

    field :budgets, [ Types::BudgetType ], null: false, description: "全予算一覧"
    def budgets
      Budget.all
    end

    field :transactions, resolver: Resolvers::TransactionsResolver, description: "取引一覧（フィルタ可）"

    field :monthly_summary, Types::MonthlySummaryType, null: false, description: "月次支出集計" do
      argument :year,  Integer, required: true
      argument :month, Integer, required: true
    end
    def monthly_summary(year:, month:)
      ::MonthlySummaryService.new(year: year, month: month).call
    end

    field :notifications, Types::NotificationType.connection_type, null: false, description: "通知一覧"
    def notifications
      Notification.all.order(created_at: :desc)
    end
  end
end
