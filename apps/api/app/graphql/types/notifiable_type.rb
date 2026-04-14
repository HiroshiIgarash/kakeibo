# frozen_string_literal: true

module Types
  class NotifiableType < Types::BaseUnion
    description "通知の対象（BudgetAlert、PaceAlert、またはUnclassifiedAlert）"

    possible_types Types::BudgetAlertType, Types::PaceAlertType, Types::UnclassifiedAlertType

    def self.resolve_type(object, _context)
      case object
      when BudgetAlert       then Types::BudgetAlertType
      when PaceAlert         then Types::PaceAlertType
      when UnclassifiedAlert then Types::UnclassifiedAlertType
      end
    end
  end
end
