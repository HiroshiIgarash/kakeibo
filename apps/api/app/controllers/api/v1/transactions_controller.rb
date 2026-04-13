module Api
  module V1
    class TransactionsController < ApplicationController
      def create
        category = resolve_category(transaction_params[:store_name], transaction_params[:category_id])
        @transaction = Transaction.new(transaction_params.merge(category: category))

        if @transaction.save
          render json: @transaction, status: :created
        else
          render json: { errors: @transaction.errors.full_messages }, status: :unprocessable_entity
        end
      end

      private

        def transaction_params
          params.require(:transaction).permit(:amount, :store_name, :purchased_at, :category_id, :source)
        end

        def resolve_category(store_name, category_id)
          return Category.find(category_id) if category_id.present?

          StoreCategoryMapping.find_by(store_name: store_name)&.category
        end
    end
  end
end
