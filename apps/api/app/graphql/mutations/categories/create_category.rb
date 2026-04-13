# frozen_string_literal: true

module Mutations
  module Categories
    class CreateCategory < Mutations::BaseMutation
      description "Categoryを作成する"

      ALLOWED_TYPES = %w[FixedCategory VariableCategory].freeze

      argument :name,          String, required: true
      argument :category_type, String, required: true, description: "FixedCategory または VariableCategory"
      argument :color,         String, required: false

      field :category, Types::CategoryType, null: true
      field :errors,   [ String ],          null: false

      def resolve(name:, category_type:, color: nil)
        unless ALLOWED_TYPES.include?(category_type)
          { category: nil, errors: [ "category_typeは#{ALLOWED_TYPES.join('または')}を指定してください" ] }
        end

        category = category_type.constantize.new(name: name, color: color)

        if category.save
          { category: category, errors: [] }
        else
          { category: nil, errors: category.errors.full_messages }
        end
      end
    end
  end
end
